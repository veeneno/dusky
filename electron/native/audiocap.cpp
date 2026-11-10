// didiscord-audiocap — captura de áudio por processo no Windows
// ===================================================================
//
// O que faz
// ---------
// Usa a captura "process loopback" do WASAPI (Windows 10 21H2+/11), que deixa pedir ao Windows o
// áudio de UM processo (e dos filhos dele) — ou o áudio de TUDO MENOS um processo. Nada disso é
// exposto pelo Chromium/Electron: o `audio: 'loopback'` do Electron pega a mistura inteira do PC,
// inclusive a voz de quem está na call tocando no próprio didiscord, e devolve pra call (eco).
//
// O áudio sai no stdout como PCM cru: float32 intercalado, 48 kHz, estéreo — exatamente o formato
// que o site (public/js/app.js, capturePcmAudioTrack) monta numa MediaStreamTrack.
//
// Modos
// -----
//   --capture include <pid>   só o áudio desse processo e dos filhos (compartilhar um app)
//   --capture exclude <pid>   tudo menos esse processo e os filhos (tela inteira sem o didiscord)
//   --list-sessions           JSON por linha: processos que têm uma sessão de áudio agora
//   --window-info <hwnd>...   JSON por linha: de qual processo/programa é cada janela
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

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <avrt.h>
#include <tlhelp32.h>
#include <winver.h>

#include <fcntl.h>
#include <io.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <atomic>
#include <map>
#include <string>
#include <thread>
#include <vector>

// audioclientactivationparams.h existe no Windows SDK (MSVC), mas não nos cabeçalhos MinGW que o
// Zig usa pra compilar do Linux. São só duas enums e duas structs documentadas — declaradas aqui
// quando o cabeçalho oficial não existe.
#if defined(__has_include)
#if __has_include(<audioclientactivationparams.h>)
#include <audioclientactivationparams.h>
#define DIDISCORD_HAS_ACTIVATION_PARAMS 1
#endif
#endif

#ifndef DIDISCORD_HAS_ACTIVATION_PARAMS
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

static int listSessions() {
  IMMDeviceEnumerator* enumerator = nullptr;
  HRESULT hr = CoCreateInstance(kCLSID_MMDeviceEnumerator, nullptr, CLSCTX_ALL, kIID_IMMDeviceEnumerator, (void**)&enumerator);
  if (FAILED(hr)) return EXIT_FAILED;

  IMMDeviceCollection* devices = nullptr;
  hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices);
  if (FAILED(hr)) { enumerator->Release(); return EXIT_FAILED; }

  std::map<DWORD, bool> sessions; // pid -> tocando agora?
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

  std::map<DWORD, DWORD> parents = parentMap();
  for (auto& s : sessions) {
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
class ActivationHandler : public IActivateAudioInterfaceCompletionHandler {
 public:
  ActivationHandler() : refs_(1), result(E_PENDING), client(nullptr) {
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

static int capture(DWORD pid, bool include) {
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
  g_wake = packetReady;
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

  client->Stop();
  if (mmcss) AvRevertMmThreadCharacteristics(mmcss);
  captureClient->Release();
  client->Release();
  CloseHandle(packetReady);
  return exitCode;
}

static int usage() {
  fputs(
      "uso:\n"
      "  didiscord-audiocap --capture include <pid>\n"
      "  didiscord-audiocap --capture exclude <pid>\n"
      "  didiscord-audiocap --list-sessions\n"
      "  didiscord-audiocap --window-info <hwnd> [hwnd...]\n",
      stderr);
  return EXIT_BAD_ARGS;
}

int main(int argc, char** argv) {
  if (argc < 2) return usage();

  _setmode(_fileno(stdout), _O_BINARY);

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return EXIT_FAILED;

  int code = EXIT_BAD_ARGS;
  if (strcmp(argv[1], "--capture") == 0 && argc == 4) {
    bool include = strcmp(argv[2], "include") == 0;
    bool exclude = strcmp(argv[2], "exclude") == 0;
    DWORD pid = (DWORD)strtoul(argv[3], nullptr, 10);
    code = (include || exclude) && pid ? capture(pid, include) : usage();
  } else if (strcmp(argv[1], "--list-sessions") == 0) {
    code = listSessions();
  } else if (strcmp(argv[1], "--window-info") == 0 && argc >= 3) {
    code = windowInfo(argc - 2, argv + 2);
  } else {
    code = usage();
  }

  CoUninitialize();
  return code;
}
