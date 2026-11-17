// dusky-audiocap — captura de áudio por processo no Windows
// ===================================================================
//
// O que faz
// ---------
// Usa a captura "process loopback" do WASAPI (Windows 10 21H2+/11), que deixa pedir ao Windows o
// áudio de UM processo (e dos filhos dele) — ou o áudio de TUDO MENOS um processo. Nada disso é
// exposto pelo Chromium/Electron: o `audio: 'loopback'` do Electron pega a mistura inteira do PC,
// inclusive a voz de quem está na call tocando no próprio dusky, e devolve pra call (eco).
//
// O áudio sai no stdout como PCM cru: float32 intercalado, 48 kHz, estéreo — exatamente o formato
// que o site (public/js/app.js, capturePcmAudioTrack) monta numa MediaStreamTrack.
//
// Modos
// -----
//   --capture include <pid>   só o áudio desse processo e dos filhos (compartilhar um app)
//   --capture exclude <pid>   tudo menos esse processo e os filhos (tela inteira sem o dusky)
//   --capture mix [opções]    tela inteira MENOS vários apps (ver "modo mix" abaixo)
//   --list-sessions [opções]  JSON por linha: processos que têm uma sessão de áudio agora
//   --window-info <hwnd>...   JSON por linha: de qual processo/programa é cada janela
//
// Opções do mix e do --list-sessions:
//   --exclude-pid <pid>       o dusky: esse processo, os filhos E os processos do WebView2 dele
//                             (que nem sempre são filhos — ver duskyRoots)
//   --webview-match <texto>   texto que aparece na linha de comando do WebView2 do dusky (a pasta
//                             de dados, com o identifier do app) — ajuda a achar o WebView2 dele
//   --exclude-exe <nome.exe>  (só no mix) não leva o som desse programa nem dos filhos dele
//
// Modo mix: o Windows só sabe "tudo menos UM processo" (exclude) ou "só UM processo" (include).
//   - nada pra tirar -> exclude do próprio audiocap (= tudo);
//   - qualquer outra coisa (inclusive só o dusky: o exclude da árvore dele deixava a voz da call
//     vazar, ver captureMix) -> um include por app que TEM sessão de áudio e não foi tirado, todos
//     misturados aqui. A lista de apps é revista a cada segundo (app que começar a tocar depois
//     entra sozinho; app que fechar sai).
//
// Na captura: imprime READY no stderr quando o áudio já está rodando, e para sozinho quando o
// stdin fecha (o Electron morreu ou parou o compartilhamento) ou quando o stdout é fechado.
//
// Por que é um .exe separado e não um módulo nativo do Node
// ---------------------------------------------------------
// Um módulo nativo fica preso à versão do Electron (ABI) e, se travar, derruba o app inteiro no
// meio da call. Um .exe pequeno não depende de versão nenhuma e, se cair, cai sozinho.
//
// Baseado no exemplo oficial da Microsoft "ApplicationLoopback" (licença MIT):
// https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/
//
// Compilar: native/build-win.cmd (MSVC, no Windows) ou native/build-cross.sh (Zig, do Linux).

#ifndef NOMINMAX
#define NOMINMAX  // std::min/std::max, não as macros do windows.h
#endif
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <avrt.h>
#include <tlhelp32.h>
#include <winternl.h>
#include <winver.h>

#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <atomic>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

// audioclientactivationparams.h existe no Windows SDK (MSVC), mas não nos cabeçalhos MinGW que o
// Zig usa pra compilar do Linux. São só duas enums e duas structs documentadas — declaradas aqui
// quando o cabeçalho oficial não existe.
#if defined(__has_include)
#if __has_include(<audioclientactivationparams.h>)
#include <audioclientactivationparams.h>
#define DUSKY_HAS_ACTIVATION_PARAMS 1
#endif
#endif

#ifndef DUSKY_HAS_ACTIVATION_PARAMS
typedef enum AUDIOCLIENT_ACTIVATION_TYPE {
  AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
  AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1,
} AUDIOCLIENT_ACTIVATION_TYPE;

typedef enum PROCESS_LOOPBACK_MODE {
  PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
  PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1,
} PROCESS_LOOPBACK_MODE;

typedef struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
  DWORD TargetProcessId;
  PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
} AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS;

typedef struct AUDIOCLIENT_ACTIVATION_PARAMS {
  AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
  union {
    AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
  };
} AUDIOCLIENT_ACTIVATION_PARAMS;

#define VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK L"VAD\\Process_Loopback"
#endif

// GUIDs declarados aqui em vez de __uuidof/IID_* — assim o mesmo arquivo compila igual no MSVC e
// no MinGW, sem depender de qual biblioteca uuid cada um traz.
static const GUID kIID_IAudioClient = { 0x1CB9AD4C, 0xDBFA, 0x4c32, { 0xB1, 0x78, 0xC2, 0xF5, 0x68, 0xA7, 0x03, 0xB2 } };
static const GUID kIID_IAudioCaptureClient = { 0xC8ADBD64, 0xE71E, 0x48a0, { 0xA4, 0xDE, 0x18, 0x5C, 0x39, 0x5C, 0xD3, 0x17 } };
static const GUID kCLSID_MMDeviceEnumerator = { 0xBCDE0395, 0xE52F, 0x467C, { 0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E } };
static const GUID kIID_IMMDeviceEnumerator = { 0xA95664D2, 0x9614, 0x4F35, { 0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6 } };
static const GUID kIID_IAudioSessionManager2 = { 0x77AA99A0, 0x1BD6, 0x484F, { 0x8B, 0xC7, 0x2C, 0x65, 0x4C, 0x9A, 0x9B, 0x6F } };
static const GUID kIID_IAudioSessionControl2 = { 0xbfb7ff88, 0x7239, 0x4fc9, { 0x8f, 0xa2, 0x07, 0xc9, 0x50, 0xbe, 0x9c, 0x6d } };
static const GUID kIID_IActivateCompletion = { 0x41D949AB, 0x9862, 0x444A, { 0x80, 0xF6, 0xC2, 0x61, 0x33, 0x4D, 0xA5, 0xEB } };
static const GUID kIID_IAgileObject = { 0x94ea2b94, 0xe9cc, 0x49e0, { 0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90 } };
static const GUID kIID_IUnknown = { 0x00000000, 0x0000, 0x0000, { 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46 } };

static const int EXIT_OK = 0;
static const int EXIT_FAILED = 1;
static const int EXIT_BAD_ARGS = 2;
static const int EXIT_UNSUPPORTED = 3; // Windows sem process loopback (ou recusou) — o app cai no plano B

static const UINT32 kSampleRate = 48000;
static const UINT32 kChannels = 2;

// ------------------------------------------------------------------
// utilidades de texto/JSON
// ------------------------------------------------------------------

static std::string toUtf8(const std::wstring& w) {
  if (w.empty()) return std::string();
  int len = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string out(len, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &out[0], len, nullptr, nullptr);
  return out;
}

static std::string jsonString(const std::string& s) {
  std::string out = "\"";
  for (unsigned char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += (char)c;
        }
    }
  }
  return out + "\"";
}

// caminho completo do executável de um processo (vazio se não der pra abrir — processo protegido,
// de outro usuário, ou que já morreu)
static std::wstring processImagePath(DWORD pid) {
  std::wstring path;
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return path;
  wchar_t buf[MAX_PATH * 2];
  DWORD size = (DWORD)(sizeof(buf) / sizeof(buf[0]));
  if (QueryFullProcessImageNameW(h, 0, buf, &size)) path.assign(buf, size);
  CloseHandle(h);
  return path;
}

static std::wstring fileNameOf(const std::wstring& path) {
  size_t slash = path.find_last_of(L"\\/");
  return slash == std::wstring::npos ? path : path.substr(slash + 1);
}

// nome amigável do programa ("Spotify" em vez de "Spotify.exe"), lido do FileDescription do .exe
static std::wstring friendlyName(const std::wstring& path) {
  std::wstring fallback = fileNameOf(path);
  size_t dot = fallback.find_last_of(L'.');
  if (dot != std::wstring::npos) fallback = fallback.substr(0, dot);
  if (path.empty()) return fallback;

  DWORD dummy = 0;
  DWORD size = GetFileVersionInfoSizeW(path.c_str(), &dummy);
  if (!size) return fallback;
  std::vector<BYTE> data(size);
  if (!GetFileVersionInfoW(path.c_str(), 0, size, data.data())) return fallback;

  struct LangCodePage { WORD lang; WORD codePage; } *translations = nullptr;
  UINT transLen = 0;
  if (!VerQueryValueW(data.data(), L"\\VarFileInfo\\Translation", (LPVOID*)&translations, &transLen) || transLen < sizeof(LangCodePage)) {
    return fallback;
  }
  wchar_t query[64];
  swprintf(query, 64, L"\\StringFileInfo\\%04x%04x\\FileDescription", translations[0].lang, translations[0].codePage);
  wchar_t* desc = nullptr;
  UINT descLen = 0;
  if (VerQueryValueW(data.data(), query, (LPVOID*)&desc, &descLen) && desc && descLen > 1) {
    std::wstring d(desc);
    while (!d.empty() && iswspace(d.back())) d.pop_back();
    if (!d.empty()) return d;
  }
  return fallback;
}

// pid -> pid do pai, de todos os processos (o Electron usa isso pra não capturar duas vezes o
// mesmo áudio quando um filho já está coberto pela árvore do pai)
static std::map<DWORD, DWORD> parentMap() {
  std::map<DWORD, DWORD> parents;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return parents;
  PROCESSENTRY32W entry;
  entry.dwSize = sizeof(entry);
  if (Process32FirstW(snap, &entry)) {
    do {
      parents[entry.th32ProcessID] = entry.th32ParentProcessID;
    } while (Process32NextW(snap, &entry));
  }
  CloseHandle(snap);
  return parents;
}

static std::wstring lowerW(std::wstring s) {
  for (auto& c : s) c = (wchar_t)towlower(c);
  return s;
}

static std::wstring fromUtf8(const char* s) {
  int len = MultiByteToWideChar(CP_UTF8, 0, s, -1, nullptr, 0);
  if (len <= 1) return std::wstring();
  std::wstring out(len - 1, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s, -1, &out[0], len);
  return out;
}

// pid -> nome do .exe em minúsculas (ex: "spotify.exe"), de todos os processos
static std::map<DWORD, std::wstring> exeMap() {
  std::map<DWORD, std::wstring> exes;
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return exes;
  PROCESSENTRY32W entry;
  entry.dwSize = sizeof(entry);
  if (Process32FirstW(snap, &entry)) {
    do {
      exes[entry.th32ProcessID] = lowerW(entry.szExeFile);
    } while (Process32NextW(snap, &entry));
  }
  CloseHandle(snap);
  return exes;
}

// `pid` é `root` ou descende dele? (subindo pelos pais; para em ciclos/pid reaproveitado)
static bool isUnder(DWORD pid, DWORD root, const std::map<DWORD, DWORD>& parents) {
  DWORD cur = pid;
  for (int i = 0; i < 64 && cur; i++) {
    if (cur == root) return true;
    auto it = parents.find(cur);
    if (it == parents.end() || it->second == cur) break;
    cur = it->second;
  }
  return false;
}

// linha de comando de outro processo (Windows 8.1+: ProcessCommandLineInformation = 60)
typedef LONG(NTAPI* NtQueryInformationProcessFn)(HANDLE, ULONG, PVOID, ULONG, PULONG);
static std::wstring processCommandLine(DWORD pid) {
  static NtQueryInformationProcessFn query = (NtQueryInformationProcessFn)GetProcAddress(GetModuleHandleW(L"ntdll.dll"), "NtQueryInformationProcess");
  if (!query) return std::wstring();
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return std::wstring();
  std::vector<BYTE> buf(8192);
  ULONG needed = 0;
  LONG status = query(h, 60, buf.data(), (ULONG)buf.size(), &needed);
  if (status == (LONG)0xC0000004 && needed > buf.size() && needed < (1u << 20)) {  // STATUS_INFO_LENGTH_MISMATCH
    buf.resize(needed);
    status = query(h, 60, buf.data(), (ULONG)buf.size(), &needed);
  }
  CloseHandle(h);
  if (status < 0) return std::wstring();
  const UNICODE_STRING* us = (const UNICODE_STRING*)buf.data();
  if (!us->Buffer || !us->Length) return std::wstring();
  return std::wstring(us->Buffer, us->Length / sizeof(wchar_t));
}

// o que NÃO entra no som (vem dos argumentos)
struct ExcludeSpec {
  std::vector<DWORD> pids;            // o dusky
  std::vector<std::wstring> webview;  // textos da linha de comando do WebView2 do dusky (minúsculas)
  std::set<std::wstring> exes;        // programas escolhidos pela pessoa (minúsculas)
};

// Raízes do "dusky": o processo dele e os processos do WebView2 que são DELE. O WebView2 roda
// em msedgewebview2.exe; normalmente é filho do app (e aí a árvore do app já cobre), mas não
// dá pra contar com isso — então procura os msedgewebview2.exe cuja linha de comando diz que o
// app dono é o dusky (--webview-exe-name=<exe do dusky>) ou que usam a pasta de dados dele.
static std::vector<DWORD> duskyRoots(const ExcludeSpec& spec, const std::map<DWORD, std::wstring>& exes) {
  std::vector<DWORD> roots;
  std::vector<std::wstring> needles = spec.webview;
  for (DWORD pid : spec.pids) {
    roots.push_back(pid);
    auto it = exes.find(pid);
    if (it != exes.end() && !it->second.empty()) needles.push_back(L"--webview-exe-name=" + it->second);
  }
  if (needles.empty()) return roots;
  for (auto& e : exes) {
    if (e.second != L"msedgewebview2.exe") continue;
    std::wstring cmd = lowerW(processCommandLine(e.first));
    if (cmd.empty()) continue;
    for (auto& n : needles) {
      if (!n.empty() && cmd.find(n) != std::wstring::npos) {
        roots.push_back(e.first);
        break;
      }
    }
  }
  return roots;
}

static bool underAny(DWORD pid, const std::vector<DWORD>& roots, const std::map<DWORD, DWORD>& parents) {
  for (DWORD r : roots) if (isUnder(pid, r, parents)) return true;
  return false;
}

// esse processo (ou um pai dele) é um dos programas tirados pela pessoa?
static bool exeExcluded(DWORD pid, const ExcludeSpec& spec, const std::map<DWORD, DWORD>& parents, const std::map<DWORD, std::wstring>& exes) {
  if (spec.exes.empty()) return false;
  DWORD cur = pid;
  for (int i = 0; i < 64 && cur; i++) {
    auto e = exes.find(cur);
    if (e != exes.end() && spec.exes.count(e->second)) return true;
    auto it = parents.find(cur);
    if (it == parents.end() || it->second == cur) break;
    cur = it->second;
  }
  return false;
}

static void printProcessJson(DWORD pid, DWORD ppid, const char* extraKey, const std::string& extraValue, bool active) {
  std::wstring path = processImagePath(pid);
  std::string exe = toUtf8(fileNameOf(path));
  std::string name = toUtf8(friendlyName(path));
  printf("{\"pid\":%lu,\"ppid\":%lu,\"exe\":%s,\"name\":%s,\"active\":%s",
         (unsigned long)pid, (unsigned long)ppid, jsonString(exe).c_str(), jsonString(name).c_str(), active ? "true" : "false");
  if (extraKey) printf(",\"%s\":%s", extraKey, extraValue.c_str());
  printf("}\n");
}

// ------------------------------------------------------------------
// --list-sessions: quem tem áudio agora, em todas as saídas ativas
// ------------------------------------------------------------------

// pid -> tocando agora? (false = tem sessão, mas parada). Devolve false se nem deu pra perguntar.
static bool sessionPids(std::map<DWORD, bool>& sessions) {
  IMMDeviceEnumerator* enumerator = nullptr;
  HRESULT hr = CoCreateInstance(kCLSID_MMDeviceEnumerator, nullptr, CLSCTX_ALL, kIID_IMMDeviceEnumerator, (void**)&enumerator);
  if (FAILED(hr)) return false;

  IMMDeviceCollection* devices = nullptr;
  hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices);
  if (FAILED(hr)) { enumerator->Release(); return false; }

  UINT deviceCount = 0;
  devices->GetCount(&deviceCount);
  for (UINT d = 0; d < deviceCount; d++) {
    IMMDevice* device = nullptr;
    if (FAILED(devices->Item(d, &device))) continue;
    IAudioSessionManager2* manager = nullptr;
    if (SUCCEEDED(device->Activate(kIID_IAudioSessionManager2, CLSCTX_ALL, nullptr, (void**)&manager))) {
      IAudioSessionEnumerator* sessionEnum = nullptr;
      if (SUCCEEDED(manager->GetSessionEnumerator(&sessionEnum))) {
        int count = 0;
        sessionEnum->GetCount(&count);
        for (int i = 0; i < count; i++) {
          IAudioSessionControl* control = nullptr;
          if (FAILED(sessionEnum->GetSession(i, &control))) continue;
          IAudioSessionControl2* control2 = nullptr;
          if (SUCCEEDED(control->QueryInterface(kIID_IAudioSessionControl2, (void**)&control2))) {
            DWORD pid = 0;
            AudioSessionState state = AudioSessionStateInactive;
            control2->GetProcessId(&pid);
            control->GetState(&state);
            // pid 0 = sons do sistema (System Sounds) — não é um app que alguém escolheria
            if (pid != 0 && state != AudioSessionStateExpired) {
              bool active = state == AudioSessionStateActive;
              sessions[pid] = sessions[pid] || active;
            }
            control2->Release();
          }
          control->Release();
        }
        sessionEnum->Release();
      }
      manager->Release();
    }
    device->Release();
  }
  devices->Release();
  enumerator->Release();
  return true;
}

// com --exclude-pid: esconde o próprio dusky (e o WebView2 dele) da lista
static int listSessions(const ExcludeSpec& spec) {
  std::map<DWORD, bool> sessions;
  if (!sessionPids(sessions)) return EXIT_FAILED;
  std::map<DWORD, DWORD> parents = parentMap();
  std::vector<DWORD> roots;
  if (!spec.pids.empty() || !spec.webview.empty()) roots = duskyRoots(spec, exeMap());
  roots.push_back(GetCurrentProcessId());
  for (auto& s : sessions) {
    if (underAny(s.first, roots, parents)) continue;
    printProcessJson(s.first, parents.count(s.first) ? parents[s.first] : 0, nullptr, std::string(), s.second);
  }
  fflush(stdout);
  return EXIT_OK;
}

// ------------------------------------------------------------------
// --window-info: de qual programa é cada janela (pro seletor pré-escolher o app certo)
// ------------------------------------------------------------------

static int windowInfo(int argc, char** argv) {
  std::map<DWORD, DWORD> parents = parentMap();
  for (int i = 0; i < argc; i++) {
    unsigned long long raw = _strtoui64(argv[i], nullptr, 10);
    HWND hwnd = (HWND)(uintptr_t)raw;
    DWORD pid = 0;
    if (!IsWindow(hwnd) || !GetWindowThreadProcessId(hwnd, &pid) || pid == 0) continue;
    printProcessJson(pid, parents.count(pid) ? parents[pid] : 0, "hwnd", std::string("\"") + argv[i] + "\"", false);
  }
  fflush(stdout);
  return EXIT_OK;
}

// ------------------------------------------------------------------
// --capture: o áudio em si
// ------------------------------------------------------------------

// recebe o resultado do ActivateAudioInterfaceAsync. Precisa ser "agile" (IAgileObject) porque o
// Windows chama ActivateCompleted de outra thread.
class ActivationHandler final : public IActivateAudioInterfaceCompletionHandler {
 public:
  ActivationHandler() : result(E_PENDING), client(nullptr), refs_(1) {
    done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  }

  STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (IsEqualGUID(riid, kIID_IUnknown) || IsEqualGUID(riid, kIID_IAgileObject) || IsEqualGUID(riid, kIID_IActivateCompletion)) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }

  STDMETHODIMP_(ULONG) AddRef() override { return (ULONG)InterlockedIncrement(&refs_); }

  STDMETHODIMP_(ULONG) Release() override {
    LONG r = InterlockedDecrement(&refs_);
    if (r == 0) delete this;
    return (ULONG)r;
  }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
    HRESULT activateResult = E_FAIL;
    IUnknown* unknown = nullptr;
    HRESULT hr = op->GetActivateResult(&activateResult, &unknown);
    if (SUCCEEDED(hr) && SUCCEEDED(activateResult) && unknown) {
      result = unknown->QueryInterface(kIID_IAudioClient, (void**)&client);
    } else {
      result = FAILED(hr) ? hr : activateResult;
    }
    if (unknown) unknown->Release();
    SetEvent(done);
    return S_OK;
  }

  HANDLE done;
  HRESULT result;
  IAudioClient* client;

 private:
  ~ActivationHandler() { if (done) CloseHandle(done); }
  LONG refs_;
};

static std::atomic<bool> g_stop(false);
static HANDLE g_wake = nullptr;

// o Electron fecha o stdin quando quer parar (ou quando morre) — essa thread percebe e acorda o
// loop de captura, que então encerra limpo
static void watchStdin() {
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  char buf[64];
  DWORD read = 0;
  while (ReadFile(in, buf, sizeof(buf), &read, nullptr) && read > 0) {
    // conteúdo ignorado — só o fechamento importa
  }
  g_stop = true;
  if (g_wake) SetEvent(g_wake);
}

static bool writeAll(HANDLE out, const void* data, DWORD size) {
  const BYTE* p = (const BYTE*)data;
  while (size > 0) {
    DWORD written = 0;
    if (!WriteFile(out, p, size, &written, nullptr) || written == 0) return false;
    p += written;
    size -= written;
  }
  return true;
}

// cliente de process loopback já iniciado (formato: 16-bit, 48 kHz, estéreo)
struct Loopback {
  IAudioClient* client = nullptr;
  IAudioCaptureClient* capture = nullptr;
  HANDLE packetReady = nullptr;
};

static void closeLoopback(Loopback& lb) {
  if (lb.client) lb.client->Stop();
  if (lb.capture) lb.capture->Release();
  if (lb.client) lb.client->Release();
  if (lb.packetReady) CloseHandle(lb.packetReady);
  lb = Loopback();
}

// EXIT_OK ou o código de erro (EXIT_UNSUPPORTED = Windows sem process loopback)
static int openLoopback(DWORD pid, bool include, Loopback& lb) {
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode = include
      ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
      : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activation;
  PropVariantInit(&activation);
  activation.vt = VT_BLOB;
  activation.blob.cbSize = sizeof(params);
  activation.blob.pBlobData = (BYTE*)&params;

  ActivationHandler* handler = new ActivationHandler();
  IActivateAudioInterfaceAsyncOperation* operation = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, kIID_IAudioClient, &activation, handler, &operation);
  if (FAILED(hr)) {
    fprintf(stderr, "ativacao recusada: 0x%08lx\n", (unsigned long)hr);
    handler->Release();
    return EXIT_UNSUPPORTED;
  }
  if (WaitForSingleObject(handler->done, 10000) != WAIT_OBJECT_0 || FAILED(handler->result) || !handler->client) {
    fprintf(stderr, "ativacao falhou: 0x%08lx\n", (unsigned long)handler->result);
    if (operation) operation->Release();
    handler->Release();
    return EXIT_UNSUPPORTED;
  }
  IAudioClient* client = handler->client;
  if (operation) operation->Release();
  handler->Release();

  // process loopback não tem "formato do dispositivo" pra negociar — a gente PEDE o formato. 16-bit
  // é o que o exemplo da Microsoft usa e funciona em todas as versões; a conversão pra float32
  // (o que o site espera) é feita aqui mesmo, logo abaixo.
  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = (WORD)kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = 16;
  format.nBlockAlign = (WORD)(format.nChannels * format.wBitsPerSample / 8);
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  const REFERENCE_TIME bufferDuration = 200000; // 20 ms, em unidades de 100 ns
  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                          AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
                          bufferDuration, 0, &format, nullptr);
  if (FAILED(hr)) {
    fprintf(stderr, "Initialize falhou: 0x%08lx\n", (unsigned long)hr);
    client->Release();
    return EXIT_UNSUPPORTED;
  }

  HANDLE packetReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  hr = client->SetEventHandle(packetReady);
  IAudioCaptureClient* captureClient = nullptr;
  if (SUCCEEDED(hr)) hr = client->GetService(kIID_IAudioCaptureClient, (void**)&captureClient);
  if (SUCCEEDED(hr)) hr = client->Start();
  if (FAILED(hr)) {
    fprintf(stderr, "Start falhou: 0x%08lx\n", (unsigned long)hr);
    if (captureClient) captureClient->Release();
    client->Release();
    CloseHandle(packetReady);
    return EXIT_FAILED;
  }
  lb.client = client;
  lb.capture = captureClient;
  lb.packetReady = packetReady;
  return EXIT_OK;
}

static int capture(DWORD pid, bool include) {
  Loopback lb;
  int opened = openLoopback(pid, include, lb);
  if (opened != EXIT_OK) return opened;
  IAudioCaptureClient* captureClient = lb.capture;
  HANDLE packetReady = lb.packetReady;
  g_wake = packetReady;

  // prioridade de áudio em tempo real (opcional — se não der, segue normal)
  DWORD taskIndex = 0;
  HANDLE mmcss = AvSetMmThreadCharacteristicsW(L"Pro Audio", &taskIndex);

  fputs("READY\n", stderr);
  fflush(stderr);

  std::thread stdinWatcher(watchStdin);
  stdinWatcher.detach();

  HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
  std::vector<float> converted;
  int exitCode = EXIT_OK;

  while (!g_stop) {
    WaitForSingleObject(packetReady, 100);
    UINT32 packetFrames = 0;
    while (!g_stop && SUCCEEDED(captureClient->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      if (FAILED(captureClient->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) {
        g_stop = true;
        exitCode = EXIT_FAILED;
        break;
      }
      converted.resize((size_t)frames * kChannels);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(converted.begin(), converted.end(), 0.0f);
      } else {
        const short* samples = (const short*)data;
        for (size_t i = 0; i < converted.size(); i++) converted[i] = samples[i] / 32768.0f;
      }
      captureClient->ReleaseBuffer(frames);
      if (!converted.empty() && !writeAll(out, converted.data(), (DWORD)(converted.size() * sizeof(float)))) {
        g_stop = true; // stdout fechado — ninguém mais está ouvindo
        break;
      }
    }
  }

  if (mmcss) AvRevertMmThreadCharacteristics(mmcss);
  g_wake = nullptr;
  closeLoopback(lb);
  return exitCode;
}

// ------------------------------------------------------------------
// --capture mix: tela inteira menos vários apps
// ------------------------------------------------------------------

static const size_t kMixFrames = 480;                    // 10 ms por bloco de saída
static const size_t kPrimeSamples = 960 * kChannels;     // 20 ms guardados antes de começar a somar
static const size_t kMaxSamples = 4800 * kChannels;      // 100 ms: passou disso, joga fora o mais velho

// um app sendo capturado (include da árvore dele), com a fila de amostras pro mixer
struct MixSource {
  DWORD pid = 0;
  std::wstring exe;
  HANDLE process = nullptr;  // segura o pid (não é reaproveitado enquanto aberto) e diz se o app fechou
  Loopback lb;
  std::thread thread;
  std::atomic<bool> stop{false};
  std::atomic<bool> dead{false};
  std::mutex m;
  std::deque<float> fifo;
  bool primed = false;  // só mexido pelo mixer
};

static void mixSourceLoop(MixSource* s) {
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  std::vector<float> converted;
  while (!s->stop && !g_stop) {
    WaitForSingleObject(s->lb.packetReady, 100);
    UINT32 packetFrames = 0;
    while (!s->stop && SUCCEEDED(s->lb.capture->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      if (FAILED(s->lb.capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) {
        s->dead = true;
        break;
      }
      converted.resize((size_t)frames * kChannels);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(converted.begin(), converted.end(), 0.0f);
      } else {
        const short* samples = (const short*)data;
        for (size_t i = 0; i < converted.size(); i++) converted[i] = samples[i] / 32768.0f;
      }
      s->lb.capture->ReleaseBuffer(frames);
      std::lock_guard<std::mutex> lock(s->m);
      s->fifo.insert(s->fifo.end(), converted.begin(), converted.end());
      if (s->fifo.size() > kMaxSamples) s->fifo.erase(s->fifo.begin(), s->fifo.end() - kPrimeSamples);
    }
    if (s->dead) break;
  }
  CoUninitialize();
}

static void stopMixSource(std::unique_ptr<MixSource>& s) {
  s->stop = true;
  if (s->lb.packetReady) SetEvent(s->lb.packetReady);
  if (s->thread.joinable()) s->thread.join();
  closeLoopback(s->lb);
  if (s->process) CloseHandle(s->process);
}

// quais pids capturar agora (um include por raiz — nunca o mesmo áudio duas vezes)
static std::set<DWORD> mixTargets(const ExcludeSpec& spec, std::vector<DWORD>& roots, std::set<DWORD>& warnedBad) {
  std::set<DWORD> wanted;
  std::map<DWORD, bool> sessions;
  if (!sessionPids(sessions)) return wanted;
  std::map<DWORD, DWORD> parents = parentMap();
  std::map<DWORD, std::wstring> exes = exeMap();
  roots = duskyRoots(spec, exes);  // o WebView2 pode ter (re)aberto
  roots.push_back(GetCurrentProcessId());

  std::set<DWORD> allowed, excluded;
  for (auto& s : sessions) {
    if (underAny(s.first, roots, parents) || exeExcluded(s.first, spec, parents, exes)) excluded.insert(s.first);
    else allowed.insert(s.first);
  }
  // capturar a árvore de um app levaria junto um filho tirado — esses ficam de fora inteiros
  std::set<DWORD> bad;
  for (DWORD e : excluded) {
    DWORD cur = e;
    for (int i = 0; i < 64 && cur; i++) {
      bad.insert(cur);
      auto it = parents.find(cur);
      if (it == parents.end() || it->second == cur) break;
      cur = it->second;
    }
  }
  for (DWORD p : allowed) {
    if (bad.count(p)) {
      if (warnedBad.insert(p).second) {
        fprintf(stderr, "sem o som de %s (%lu): um processo filho dele foi tirado\n", toUtf8(exes[p]).c_str(), (unsigned long)p);
      }
      continue;
    }
    // um pai que também vai ser capturado já cobre este
    bool covered = false;
    auto it = parents.find(p);
    DWORD cur = it == parents.end() ? 0 : it->second;
    for (int i = 0; i < 64 && cur; i++) {
      if (allowed.count(cur) && !bad.count(cur)) { covered = true; break; }
      auto up = parents.find(cur);
      if (up == parents.end() || up->second == cur) break;
      cur = up->second;
    }
    if (!covered) wanted.insert(p);
  }
  return wanted;
}

static bool waitUntil(HANDLE timer, LONGLONG deadlineQpc, LONGLONG qpcFreq) {
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);
  LONGLONG left = deadlineQpc - now.QuadPart;
  if (left <= 0) return true;
  if (timer) {
    LARGE_INTEGER due;
    due.QuadPart = -(left * 10000000LL / qpcFreq);  // relativo, em 100 ns
    if (SetWaitableTimer(timer, &due, 0, nullptr, nullptr, FALSE)) {
      WaitForSingleObject(timer, INFINITE);
      return true;
    }
  }
  Sleep((DWORD)std::max<LONGLONG>(1, left * 1000 / qpcFreq));
  return true;
}

static int captureMix(const ExcludeSpec& spec) {
  // Nada pra tirar: o exclude do próprio audiocap (= tudo). Qualquer outra coisa — inclusive só o
  // dusky — vai pela MISTURA (um include por app). O exclude da árvore do dusky NÃO tirava o som
  // dele na prática: no Windows 11 26200 com WebView2 157, o processo que toca a call
  // (msedgewebview2 --utility-sub-type=audio.mojom.AudioService) é neto do dusky.exe e mesmo
  // assim a voz da call vazava pra tela compartilhada (eco). O include (compartilhar uma janela)
  // funciona — então a tela inteira passou a ser "o include de cada app que não foi tirado".
  {
    std::vector<DWORD> roots = duskyRoots(spec, exeMap());
    if (spec.exes.empty() && roots.empty()) {
      fputs("modo: tudo (nada pra tirar)\n", stderr);
      return capture(GetCurrentProcessId(), false);
    }
    fprintf(stderr, "modo: mistura — sem o dusky (%u processo(s) dele) e sem %u programa(s) escolhido(s)\n",
            (unsigned)roots.size(), (unsigned)spec.exes.size());
  }

  // testa se o Windows tem process loopback antes de dizer READY (senão o app cai no plano B)
  {
    Loopback probe;
    int code = openLoopback(GetCurrentProcessId(), false, probe);
    closeLoopback(probe);
    if (code != EXIT_OK) return code;
  }

  HANDLE wake = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_wake = wake;
  std::thread stdinWatcher(watchStdin);
  stdinWatcher.detach();

  std::mutex sourcesLock;
  std::vector<std::unique_ptr<MixSource>> sources;
  std::atomic<bool> outputFailed(false);

  // mixer: um bloco de 10 ms a cada 10 ms, somando o que cada app tiver
  std::thread mixer([&]() {
    DWORD taskIndex = 0;
    HANDLE mmcss = AvSetMmThreadCharacteristicsW(L"Pro Audio", &taskIndex);
    HANDLE timer = CreateWaitableTimerExW(nullptr, nullptr, 0x00000002 /* HIGH_RESOLUTION */, TIMER_ALL_ACCESS);
    if (!timer) timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
    LARGE_INTEGER freq, now;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&now);
    const LONGLONG step = freq.QuadPart * (LONGLONG)kMixFrames / kSampleRate;
    LONGLONG deadline = now.QuadPart + step;
    HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
    std::vector<float> mix(kMixFrames * kChannels);
    while (!g_stop) {
      waitUntil(timer, deadline, freq.QuadPart);
      deadline += step;
      QueryPerformanceCounter(&now);
      if (now.QuadPart - deadline > freq.QuadPart / 10) deadline = now.QuadPart + step;  // atrasou muito (PC travou): recomeça
      std::fill(mix.begin(), mix.end(), 0.0f);
      {
        std::lock_guard<std::mutex> lock(sourcesLock);
        for (auto& s : sources) {
          std::lock_guard<std::mutex> l(s->m);
          if (!s->primed) {
            if (s->fifo.size() < kPrimeSamples) continue;
            s->primed = true;
          }
          size_t n = std::min(mix.size(), s->fifo.size());
          for (size_t i = 0; i < n; i++) mix[i] += s->fifo[i];
          s->fifo.erase(s->fifo.begin(), s->fifo.begin() + n);
          if (s->fifo.empty()) s->primed = false;  // esvaziou: junta 20 ms de novo antes de voltar
        }
      }
      for (auto& v : mix) v = std::max(-1.0f, std::min(1.0f, v));
      if (!writeAll(out, mix.data(), (DWORD)(mix.size() * sizeof(float)))) {
        outputFailed = true;
        g_stop = true;
        if (g_wake) SetEvent(g_wake);
        break;
      }
    }
    if (timer) CloseHandle(timer);
    if (mmcss) AvRevertMmThreadCharacteristics(mmcss);
  });

  fputs("READY\n", stderr);
  fflush(stderr);

  std::map<DWORD, ULONGLONG> failedAt;  // não insiste num app que recusou a captura (10 s)
  std::set<DWORD> warnedBad;
  std::vector<DWORD> roots;
  while (!g_stop) {
    std::set<DWORD> wanted = mixTargets(spec, roots, warnedBad);
    std::map<DWORD, std::wstring> exes = exeMap();
    std::vector<std::unique_ptr<MixSource>> removed;
    {
      std::lock_guard<std::mutex> lock(sourcesLock);
      for (auto it = sources.begin(); it != sources.end();) {
        MixSource* s = it->get();
        bool exited = s->process && WaitForSingleObject(s->process, 0) == WAIT_OBJECT_0;
        if (s->dead || exited || !wanted.count(s->pid)) {
          removed.push_back(std::move(*it));
          it = sources.erase(it);
        } else {
          wanted.erase(s->pid);  // já está sendo capturado
          ++it;
        }
      }
    }
    for (auto& s : removed) {
      fprintf(stderr, "parou de capturar %s (%lu)\n", toUtf8(s->exe).c_str(), (unsigned long)s->pid);
      stopMixSource(s);
    }
    ULONGLONG nowMs = GetTickCount64();
    for (DWORD pid : wanted) {
      auto f = failedAt.find(pid);
      if (f != failedAt.end() && nowMs - f->second < 10000) continue;
      auto s = std::make_unique<MixSource>();
      s->pid = pid;
      s->exe = exes.count(pid) ? exes[pid] : L"?";
      s->process = OpenProcess(SYNCHRONIZE, FALSE, pid);
      if (openLoopback(pid, true, s->lb) != EXIT_OK) {
        failedAt[pid] = nowMs;
        if (s->process) CloseHandle(s->process);
        continue;
      }
      fprintf(stderr, "capturando %s (%lu)\n", toUtf8(s->exe).c_str(), (unsigned long)pid);
      MixSource* raw = s.get();
      s->thread = std::thread(mixSourceLoop, raw);
      std::lock_guard<std::mutex> lock(sourcesLock);
      sources.push_back(std::move(s));
    }
    fflush(stderr);
    WaitForSingleObject(wake, 1000);
  }

  g_stop = true;
  mixer.join();
  std::lock_guard<std::mutex> lock(sourcesLock);
  for (auto& s : sources) stopMixSource(s);
  sources.clear();
  g_wake = nullptr;
  CloseHandle(wake);
  return EXIT_OK;
}

static int usage() {
  fputs(
      "uso:\n"
      "  dusky-audiocap --capture include <pid>\n"
      "  dusky-audiocap --capture exclude <pid>\n"
      "  dusky-audiocap --capture mix [--exclude-pid <pid>] [--webview-match <texto>] [--exclude-exe <nome.exe>]...\n"
      "  dusky-audiocap --list-sessions [--exclude-pid <pid>] [--webview-match <texto>]\n"
      "  dusky-audiocap --window-info <hwnd> [hwnd...]\n",
      stderr);
  return EXIT_BAD_ARGS;
}

int main(int argc, char** argv) {
  if (argc < 2) return usage();

  _setmode(_fileno(stdout), _O_BINARY);

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return EXIT_FAILED;

  // opções do mix / --list-sessions (a partir de `first`)
  auto parseSpec = [&](int first, ExcludeSpec& spec) -> bool {
    for (int i = first; i < argc; i++) {
      if (i + 1 >= argc) return false;
      if (strcmp(argv[i], "--exclude-pid") == 0) {
        DWORD pid = (DWORD)strtoul(argv[++i], nullptr, 10);
        if (pid) spec.pids.push_back(pid);
      } else if (strcmp(argv[i], "--webview-match") == 0) {
        std::wstring w = lowerW(fromUtf8(argv[++i]));
        if (w.size() >= 4) spec.webview.push_back(w);
      } else if (strcmp(argv[i], "--exclude-exe") == 0) {
        std::wstring e = lowerW(fromUtf8(argv[++i]));
        if (!e.empty()) spec.exes.insert(e);
      } else {
        return false;
      }
    }
    return true;
  };

  int code = EXIT_BAD_ARGS;
  if (strcmp(argv[1], "--capture") == 0 && argc >= 3 && strcmp(argv[2], "mix") == 0) {
    ExcludeSpec spec;
    code = parseSpec(3, spec) ? captureMix(spec) : usage();
  } else if (strcmp(argv[1], "--capture") == 0 && argc == 4) {
    bool include = strcmp(argv[2], "include") == 0;
    bool exclude = strcmp(argv[2], "exclude") == 0;
    DWORD pid = (DWORD)strtoul(argv[3], nullptr, 10);
    code = (include || exclude) && pid ? capture(pid, include) : usage();
  } else if (strcmp(argv[1], "--list-sessions") == 0) {
    ExcludeSpec spec;
    code = parseSpec(2, spec) ? listSessions(spec) : usage();
  } else if (strcmp(argv[1], "--window-info") == 0 && argc >= 3) {
    code = windowInfo(argc - 2, argv + 2);
  } else {
    code = usage();
  }

  CoUninitialize();
  return code;
}
