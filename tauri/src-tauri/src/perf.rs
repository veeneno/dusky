//! Aba "desempenho" das configurações: quanto CADA processo do dusky está usando de processador,
//! memória e placa de vídeo — o app (Rust), o motor das páginas (WebKitGTK no Linux, WebView2 no
//! Windows), o auxiliar de tela (dusky-screencast), o ffmpeg/GStreamer da captura, o áudio da tela…
//!
//! Quem é "do dusky": este processo e todos os descendentes dele (filhos, netos…). No Windows o
//! WebView2 é filho do app, e as páginas/GPU do WebView2 são filhas dele; no Linux o WebKitGTK abre
//! WebKitWebProcess/WebKitNetworkProcess (às vezes por dentro do bwrap, o isolamento dele).
//!
//! De onde vem cada número:
//!   processador  Linux: /proc/<pid>/stat (utime+stime) · Windows: GetProcessTimes. Diferença entre
//!                duas leituras ÷ tempo ÷ núcleos = % do computador inteiro (igual ao Gerenciador
//!                de Tarefas: todos os núcleos ocupados = 100%).
//!   memória      Linux: PSS (/proc/<pid>/smaps_rollup — divide a memória compartilhada entre quem
//!                usa, então somar não conta a mesma coisa duas vezes); sem permissão, o RSS.
//!                Windows: memória privada (PrivateUsage).
//!   placa        Linux: fdinfo do DRM (/proc/<pid>/fdinfo, AMD/Intel/nouveau e NVIDIA nova); se
//!                não tiver, `nvidia-smi pmon` (NVIDIA proprietário). Windows: os contadores
//!                "GPU Engine" e "GPU Process Memory" do sistema (os mesmos do Gerenciador de
//!                Tarefas). GPU % = o motor mais ocupado (3D, codificador de vídeo…); VRAM = dedicada.

use crate::app;
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Webview};

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pid: u32,
    ppid: u32,
    name: String,
    role: String,
    /// % do computador inteiro (todos os núcleos = 100)
    cpu_percent: Option<f64>,
    memory_bytes: Option<u64>,
    /// motor da placa de vídeo mais ocupado por esse processo
    gpu_percent: Option<f64>,
    /// memória dedicada da placa de vídeo
    gpu_memory_bytes: Option<u64>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    os: &'static str,
    cpus: usize,
    total_memory_bytes: Option<u64>,
    /// o que o número de memória significa ("PSS", "privada"…)
    memory_kind: &'static str,
    /// de onde veio o número da placa de vídeo (null = não deu pra medir)
    gpu_source: Option<String>,
    /// por que não tem número da placa (ou uma ressalva)
    gpu_note: Option<String>,
    processes: Vec<ProcInfo>,
}

// ---------------------------------------------------------------- leitura "crua"

/// uma leitura de um processo: os contadores que só viram % comparando com a leitura anterior
#[derive(Default, Clone)]
struct RawProc {
    pid: u32,
    ppid: u32,
    name: String,
    role: String,
    /// tempo de processador gasto desde que o processo abriu, em ns
    cpu_ns: Option<u64>,
    memory: Option<u64>,
    /// Linux/DRM: (cliente DRM + motor) -> (ns ocupado, ciclos ocupados, ciclos totais)
    gpu_engines: Vec<(String, EngineCounter)>,
    /// Windows/PDH e nvidia-smi: a % já vem pronta
    gpu_percent: Option<f64>,
    gpu_memory: Option<u64>,
}

#[derive(Default, Clone, Copy)]
struct EngineCounter {
    busy_ns: Option<u64>,
    cycles: Option<u64>,
    total_cycles: Option<u64>,
}

struct Raw {
    at: Instant,
    procs: Vec<RawProc>,
    gpu_source: Option<String>,
    gpu_note: Option<String>,
}

struct Prev {
    at: Instant,
    cpu: HashMap<u32, u64>,
    engines: HashMap<(u32, String), EngineCounter>,
}

static PREV: Mutex<Option<Prev>> = Mutex::new(None);

fn cpu_count() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}

/// descendentes de `root` (inclusive ele), na ordem pai → filhos
fn descendants(root: u32, all: &[(u32, u32)]) -> Vec<u32> {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, ppid) in all {
        if pid != ppid {
            children.entry(*ppid).or_default().push(*pid);
        }
    }
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut queue = VecDeque::from([root]);
    while let Some(pid) = queue.pop_front() {
        if !seen.insert(pid) {
            continue;
        }
        out.push(pid);
        if let Some(list) = children.get(&pid) {
            let mut list = list.clone();
            list.sort_unstable();
            queue.extend(list);
        }
    }
    out
}

// ---------------------------------------------------------------- Linux

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    /// ticks do relógio do /proc/<pid>/stat por segundo (USER_HZ: 100 em todo Linux x86/ARM)
    const CLK_TCK: u64 = 100;

    struct Stat {
        ppid: u32,
        comm: String,
        cpu_ns: u64,
    }

    fn read_stat(pid: u32) -> Option<Stat> {
        let s = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        // o nome fica entre parênteses e pode ter espaço/parêntese dentro: corta no ÚLTIMO ')'
        let open = s.find('(')?;
        let close = s.rfind(')')?;
        let comm = s[open + 1..close].to_string();
        let rest: Vec<&str> = s[close + 1..].split_whitespace().collect();
        // rest[0] = estado (campo 3); ppid = campo 4; utime = 14; stime = 15
        let ppid = rest.get(1)?.parse().ok()?;
        let utime: u64 = rest.get(11)?.parse().ok()?;
        let stime: u64 = rest.get(12)?.parse().ok()?;
        Some(Stat { ppid, comm, cpu_ns: (utime + stime) * (1_000_000_000 / CLK_TCK) })
    }

    fn cmdline(pid: u32) -> Vec<String> {
        std::fs::read(format!("/proc/{pid}/cmdline"))
            .map(|raw| raw.split(|b| *b == 0).filter(|a| !a.is_empty()).map(|a| String::from_utf8_lossy(a).into_owned()).collect())
            .unwrap_or_default()
    }

    /// "123 kB" / "123 KiB" / "4 MiB" / "123" (bytes) -> bytes
    fn parse_size(v: &str) -> Option<u64> {
        let mut it = v.split_whitespace();
        let n: u64 = it.next()?.parse().ok()?;
        let mult = match it.next().unwrap_or("") {
            "" | "B" => 1,
            "kB" | "KiB" | "KB" => 1024,
            "MiB" | "MB" => 1024 * 1024,
            "GiB" | "GB" => 1024 * 1024 * 1024,
            _ => 1,
        };
        Some(n * mult)
    }

    /// PSS (justo com memória compartilhada); sem permissão (processo isolado do WebKit), o RSS
    fn memory(pid: u32) -> Option<u64> {
        if let Ok(s) = std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup")) {
            if let Some(v) = s.lines().find_map(|l| l.strip_prefix("Pss:")) {
                return parse_size(v.trim());
            }
        }
        let s = std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
        s.lines().find_map(|l| l.strip_prefix("VmRSS:")).and_then(|v| parse_size(v.trim()))
    }

    /// placa de vídeo pelo fdinfo do DRM: (motores, VRAM). Cada "cliente DRM" (um arquivo aberto
    /// da placa) aparece em todo fd que aponta pra ele — conta uma vez só (seen_clients).
    fn drm(pid: u32, seen_clients: &mut HashSet<String>) -> (Vec<(String, EngineCounter)>, Option<u64>) {
        let mut engines = Vec::new();
        let mut vram: Option<u64> = None;
        let Ok(dir) = std::fs::read_dir(format!("/proc/{pid}/fdinfo")) else { return (engines, vram) };
        for entry in dir.flatten() {
            let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
            if !text.contains("drm-client-id") {
                continue;
            }
            let mut client = String::new();
            let mut pdev = String::new();
            let mut map: HashMap<String, EngineCounter> = HashMap::new();
            let mut mem: u64 = 0;
            let mut has_mem = false;
            for line in text.lines() {
                let Some((k, v)) = line.split_once(':') else { continue };
                let v = v.trim();
                if k == "drm-client-id" {
                    client = v.to_string();
                } else if k == "drm-pdev" {
                    pdev = v.to_string();
                } else if let Some(name) = k.strip_prefix("drm-engine-") {
                    if name.starts_with("capacity-") {
                        continue;
                    }
                    if let Some(ns) = v.strip_suffix(" ns").and_then(|n| n.trim().parse().ok()) {
                        map.entry(name.to_string()).or_default().busy_ns = Some(ns);
                    }
                } else if let Some(name) = k.strip_prefix("drm-cycles-") {
                    map.entry(name.to_string()).or_default().cycles = v.parse().ok();
                } else if let Some(name) = k.strip_prefix("drm-total-cycles-") {
                    map.entry(name.to_string()).or_default().total_cycles = v.parse().ok();
                } else if k == "drm-memory-vram" || k.starts_with("drm-resident-vram") || k.starts_with("drm-resident-local") {
                    if let Some(b) = parse_size(v) {
                        mem += b;
                        has_mem = true;
                    }
                }
            }
            let key = format!("{pdev}/{client}");
            if client.is_empty() || !seen_clients.insert(key.clone()) {
                continue;
            }
            for (name, c) in map {
                engines.push((format!("{key}/{name}"), c));
            }
            if has_mem {
                vram = Some(vram.unwrap_or(0) + mem);
            }
        }
        (engines, vram)
    }

    fn role(pid: u32, name: &str, argv: &[String]) -> String {
        let me = std::process::id();
        let r = if pid == me {
            "app (Rust)"
        } else if name.starts_with("WebKitWebProces") {
            "páginas do site (WebKit)"
        } else if name.starts_with("WebKitNetworkPr") {
            "rede (WebKit)"
        } else if name.starts_with("WebKitGPUProces") {
            "placa de vídeo (WebKit)"
        } else if name == "bwrap" || name == "xdg-dbus-proxy" {
            "isolamento do WebKit"
        } else if name.starts_with("dusky-screencast") {
            if argv.iter().any(|a| a == "watch") { "assistir telas (auxiliar)" } else { "compartilhar tela (auxiliar)" }
        } else if name == "ffmpeg" || name.starts_with("gst-launch") {
            "captura e codificação da tela"
        } else if name.starts_with("pw-") || name.starts_with("parec") || name.starts_with("pacat") || name.starts_with("pactl") {
            "som da tela"
        } else {
            "processo do dusky"
        };
        r.to_string()
    }

    pub fn total_memory() -> Option<u64> {
        let s = std::fs::read_to_string("/proc/meminfo").ok()?;
        s.lines().find_map(|l| l.strip_prefix("MemTotal:")).and_then(|v| parse_size(v.trim()))
    }

    pub fn sample() -> Vec<RawProc> {
        let mut all: Vec<(u32, u32)> = Vec::new();
        let mut stats: HashMap<u32, Stat> = HashMap::new();
        if let Ok(dir) = std::fs::read_dir("/proc") {
            for entry in dir.flatten() {
                let Some(pid) = entry.file_name().to_str().and_then(|s| s.parse::<u32>().ok()) else { continue };
                if let Some(st) = read_stat(pid) {
                    all.push((pid, st.ppid));
                    stats.insert(pid, st);
                }
            }
        }
        let mut seen_clients = HashSet::new();
        let mut out = Vec::new();
        for pid in descendants(std::process::id(), &all) {
            let Some(st) = stats.remove(&pid) else { continue };
            let argv = cmdline(pid);
            // o nome do /proc/<pid>/stat corta em 15 letras: o do executável é melhor quando dá
            let name = argv
                .first()
                .and_then(|a| a.rsplit('/').next())
                .filter(|n| !n.is_empty() && n.len() <= 64)
                .map(str::to_string)
                .unwrap_or_else(|| st.comm.clone());
            let (gpu_engines, gpu_memory) = drm(pid, &mut seen_clients);
            out.push(RawProc {
                pid,
                ppid: st.ppid,
                role: role(pid, &name, &argv),
                name,
                cpu_ns: Some(st.cpu_ns),
                memory: memory(pid),
                gpu_engines,
                gpu_memory,
                ..Default::default()
            });
        }
        out
    }

    /// NVIDIA proprietário (sem fdinfo do DRM): `nvidia-smi pmon` dá, por processo, sm/enc/dec % e
    /// a memória da placa (fb, MB). Lê as colunas pelo cabeçalho (mudam entre versões do driver).
    pub async fn nvidia_pmon() -> Option<HashMap<u32, (Option<f64>, Option<u64>)>> {
        if !std::path::Path::new("/proc/driver/nvidia/version").exists() {
            return None;
        }
        let mut cmd = crate::screencast::child_command("nvidia-smi");
        cmd.args(["pmon", "-c", "1", "-s", "um"]).stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        let out = tokio::time::timeout(Duration::from_secs(4), cmd.output()).await.ok()?.ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let mut cols: Vec<String> = Vec::new();
        let mut map = HashMap::new();
        for line in text.lines() {
            if let Some(h) = line.strip_prefix('#') {
                if cols.is_empty() {
                    cols = h.split_whitespace().map(|s| s.to_lowercase()).collect();
                }
                continue;
            }
            let f: Vec<&str> = line.split_whitespace().collect();
            let get = |name: &str| cols.iter().position(|c| c == name).and_then(|i| f.get(i)).and_then(|v| v.parse::<f64>().ok());
            let Some(pid) = get("pid").map(|p| p as u32) else { continue };
            let busy = ["sm", "enc", "dec"].iter().filter_map(|c| get(c)).fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.max(v))));
            let fb = get("fb").map(|mb| (mb * 1024.0 * 1024.0) as u64);
            // o mesmo processo pode aparecer duas vezes (contexto gráfico + computação): soma a memória
            let e = map.entry(pid).or_insert((None, None));
            e.0 = match (e.0, busy) { (Some(a), Some(b)) => Some(f64::max(a, b)), (a, b) => a.or(b) };
            e.1 = match (e.1, fb) { (Some(a), Some(b)) => Some(a + b), (a, b) => a.or(b) };
        }
        Some(map)
    }
}

// ---------------------------------------------------------------- Windows

#[cfg(windows)]
mod win {
    use super::*;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows_sys::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    fn ft(f: &FILETIME) -> u64 {
        ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
    }

    /// (criado em, tempo de processador em ns, memória privada)
    fn query(pid: u32) -> Option<(u64, u64, Option<u64>)> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return None;
            }
            let (mut c, mut e, mut k, mut u): (FILETIME, FILETIME, FILETIME, FILETIME) =
                (std::mem::zeroed(), std::mem::zeroed(), std::mem::zeroed(), std::mem::zeroed());
            let times = GetProcessTimes(h, &mut c, &mut e, &mut k, &mut u) != 0;
            let mut pmc: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
            pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
            let mem = (K32GetProcessMemoryInfo(h, &mut pmc as *mut PROCESS_MEMORY_COUNTERS_EX as *mut PROCESS_MEMORY_COUNTERS, pmc.cb) != 0)
                .then_some(pmc.PrivateUsage as u64);
            CloseHandle(h);
            // FILETIME = unidades de 100 ns
            times.then(|| (ft(&c), (ft(&k) + ft(&u)) * 100, mem))
        }
    }

    fn role(pid: u32, ppid: u32, name: &str) -> String {
        let me = std::process::id();
        let n = name.to_lowercase();
        let r = if pid == me {
            "app (Rust)"
        } else if n == "msedgewebview2.exe" {
            if ppid == me { "WebView2 (principal)" } else { "WebView2 (páginas, placa de vídeo…)" }
        } else if n.starts_with("dusky-screencast") {
            "compartilhar tela (auxiliar)"
        } else if n == "ffmpeg.exe" {
            "captura e codificação da tela"
        } else if n.starts_with("dusky-audiocap") {
            "som da tela"
        } else if n == "conhost.exe" {
            "console do Windows"
        } else {
            "processo do dusky"
        };
        r.to_string()
    }

    pub fn total_memory() -> Option<u64> {
        unsafe {
            let mut m: MEMORYSTATUSEX = std::mem::zeroed();
            m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
            (GlobalMemoryStatusEx(&mut m) != 0).then_some(m.ullTotalPhys)
        }
    }

    pub fn sample() -> Vec<RawProc> {
        let mut all: Vec<(u32, u32)> = Vec::new();
        let mut names: HashMap<u32, String> = HashMap::new();
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE || snap.is_null() {
                return Vec::new();
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut entry) != 0;
            while ok {
                let n = entry.szExeFile.iter().position(|c| *c == 0).unwrap_or(entry.szExeFile.len());
                all.push((entry.th32ProcessID, entry.th32ParentProcessID));
                names.insert(entry.th32ProcessID, String::from_utf16_lossy(&entry.szExeFile[..n]));
                ok = Process32NextW(snap, &mut entry) != 0;
            }
            CloseHandle(snap);
        }
        let parent: HashMap<u32, u32> = all.iter().copied().collect();
        // o Windows reaproveita números de processo: um "filho" cujo pai morreu pode apontar pra um
        // número que hoje é nosso. Só conta como nosso quem foi criado DEPOIS do pai.
        let mut created: HashMap<u32, u64> = HashMap::new();
        let mut out = Vec::new();
        for pid in descendants(std::process::id(), &all) {
            let ppid = parent.get(&pid).copied().unwrap_or(0);
            let info = query(pid);
            if let Some((c, _, _)) = info {
                created.insert(pid, c);
            }
            if pid != std::process::id() {
                let parent_is_ours = out.iter().any(|p: &RawProc| p.pid == ppid);
                let newer = match (info, created.get(&ppid)) {
                    (Some((c, _, _)), Some(pc)) => c >= *pc,
                    _ => true,
                };
                if !parent_is_ours || !newer {
                    continue;
                }
            }
            let name = names.get(&pid).cloned().unwrap_or_default();
            out.push(RawProc {
                pid,
                ppid,
                role: role(pid, ppid, &name),
                name,
                cpu_ns: info.map(|i| i.1),
                memory: info.and_then(|i| i.2),
                ..Default::default()
            });
        }
        out
    }

    // ---------- placa de vídeo pelos contadores do sistema (PDH) ----------

    use windows_sys::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE_ITEM_W,
    };

    // pdh.h (o windows-sys não exporta todos): formato do valor e "mais dados"
    const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
    const PDH_FMT_LARGE: u32 = 0x0000_0400;
    const PDH_FMT_NOCAP100: u32 = 0x0000_8000;
    const PDH_MORE_DATA: u32 = 0x8000_07D2;

    struct Pdh {
        query: isize,
        engine: isize,
        memory: isize,
        created: Instant,
    }

    static PDH: Mutex<Option<Pdh>> = Mutex::new(None);

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn open() -> Option<Pdh> {
        let mut q = std::mem::zeroed();
        if PdhOpenQueryW(std::ptr::null(), 0, &mut q) != 0 {
            return None;
        }
        let mut engine = std::mem::zeroed();
        let mut memory = std::mem::zeroed();
        let a = PdhAddEnglishCounterW(q, wide("\\GPU Engine(*)\\Utilization Percentage").as_ptr(), 0, &mut engine);
        let b = PdhAddEnglishCounterW(q, wide("\\GPU Process Memory(*)\\Dedicated Usage").as_ptr(), 0, &mut memory);
        if a != 0 && b != 0 {
            PdhCloseQuery(q);
            return None;
        }
        // a % é uma taxa: precisa de uma leitura antes pra comparar
        PdhCollectQueryData(q);
        Some(Pdh {
            query: q as isize,
            engine: if a == 0 { engine as isize } else { 0 },
            memory: if b == 0 { memory as isize } else { 0 },
            created: Instant::now(),
        })
    }

    /// "pid_1234_luid_0x…_phys_0_eng_3_engtype_3D" -> 1234
    fn pid_of(instance: &str) -> Option<u32> {
        let rest = instance.strip_prefix("pid_")?;
        rest[..rest.find('_').unwrap_or(rest.len())].parse().ok()
    }

    unsafe fn read_array(counter: isize, format: u32) -> Vec<(String, f64, i64)> {
        let mut out = Vec::new();
        if counter == 0 {
            return out;
        }
        let mut size: u32 = 0;
        let mut count: u32 = 0;
        let r = PdhGetFormattedCounterArrayW(counter as _, format as _, &mut size, &mut count, std::ptr::null_mut());
        if r != PDH_MORE_DATA || size == 0 {
            return out;
        }
        // o tamanho vem em bytes; o buffer guarda os itens E os nomes deles
        let items = (size as usize).div_ceil(std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>()) + 1;
        let mut buf: Vec<PDH_FMT_COUNTERVALUE_ITEM_W> = Vec::with_capacity(items);
        if PdhGetFormattedCounterArrayW(counter as _, format as _, &mut size, &mut count, buf.as_mut_ptr()) != 0 {
            return out;
        }
        buf.set_len(count as usize);
        for item in &buf {
            if item.FmtValue.CStatus > 1 {
                continue; // PDH_CSTATUS_VALID_DATA (0) ou NEW_DATA (1)
            }
            let mut n = 0;
            while *item.szName.add(n) != 0 {
                n += 1;
            }
            let name = String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, n));
            out.push((name, item.FmtValue.Anonymous.doubleValue, item.FmtValue.Anonymous.largeValue));
        }
        out
    }

    /// pid -> (motor mais ocupado %, memória dedicada). Err = contadores indisponíveis.
    pub fn gpu() -> Result<HashMap<u32, (Option<f64>, Option<u64>)>, String> {
        let mut guard = PDH.lock().unwrap();
        // processo que abriu agora: recria a consulta de tempos em tempos pra ele aparecer
        if guard.as_ref().map(|p| p.created.elapsed() > Duration::from_secs(60)).unwrap_or(false) {
            if let Some(p) = guard.take() {
                unsafe { PdhCloseQuery(p.query as _) };
            }
        }
        if guard.is_none() {
            *guard = unsafe { open() };
            if guard.is_some() {
                std::thread::sleep(Duration::from_millis(250));
            }
        }
        let Some(p) = guard.as_ref() else { return Err("contadores de GPU do Windows indisponíveis".into()) };
        let mut map: HashMap<u32, (Option<f64>, Option<u64>)> = HashMap::new();
        unsafe {
            if PdhCollectQueryData(p.query as _) != 0 {
                return Err("não consegui ler os contadores de GPU".into());
            }
            for (name, v, _) in read_array(p.engine, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100) {
                let Some(pid) = pid_of(&name) else { continue };
                let e = map.entry(pid).or_default();
                e.0 = Some(e.0.map_or(v, |m: f64| m.max(v)));
            }
            for (name, _, bytes) in read_array(p.memory, PDH_FMT_LARGE) {
                let Some(pid) = pid_of(&name) else { continue };
                let e = map.entry(pid).or_default();
                e.1 = Some(e.1.unwrap_or(0) + bytes.max(0) as u64);
            }
        }
        Ok(map)
    }
}

// ---------------------------------------------------------------- juntando

#[cfg(target_os = "linux")]
async fn sample_raw() -> Raw {
    let procs = tauri::async_runtime::spawn_blocking(linux::sample).await.unwrap_or_default();
    let mut raw = Raw { at: Instant::now(), procs, gpu_source: None, gpu_note: None };
    let drm = raw.procs.iter().any(|p| !p.gpu_engines.is_empty());
    if drm {
        raw.gpu_source = Some("fdinfo do DRM (driver da placa)".into());
    }
    // NVIDIA proprietário: o fdinfo não tem os motores — pergunta pro nvidia-smi
    if !drm {
        match linux::nvidia_pmon().await {
            Some(map) => {
                raw.gpu_source = Some("nvidia-smi".into());
                for p in &mut raw.procs {
                    if let Some((busy, fb)) = map.get(&p.pid) {
                        p.gpu_percent = *busy;
                        p.gpu_memory = fb.or(p.gpu_memory);
                    } else {
                        p.gpu_percent = Some(0.0);
                    }
                }
            }
            None if raw.procs.iter().any(|p| p.gpu_memory.is_some()) => {
                raw.gpu_source = Some("fdinfo do DRM (driver da placa)".into());
                raw.gpu_note = Some("o driver informa só a memória da placa, não o uso".into());
            }
            None => raw.gpu_note = Some("o driver da placa de vídeo não informa uso por processo (precisa de fdinfo do DRM ou do nvidia-smi)".into()),
        }
    }
    raw
}

#[cfg(windows)]
async fn sample_raw() -> Raw {
    tauri::async_runtime::spawn_blocking(|| {
        let mut procs = win::sample();
        let mut raw = Raw { at: Instant::now(), procs: Vec::new(), gpu_source: None, gpu_note: None };
        match win::gpu() {
            Ok(map) => {
                raw.gpu_source = Some("contadores do Windows (os do Gerenciador de Tarefas)".into());
                for p in &mut procs {
                    let (busy, mem) = map.get(&p.pid).copied().unwrap_or((None, None));
                    p.gpu_percent = Some(busy.unwrap_or(0.0));
                    p.gpu_memory = mem;
                }
            }
            Err(e) => raw.gpu_note = Some(e),
        }
        raw.procs = procs;
        raw
    })
    .await
    .unwrap_or(Raw { at: Instant::now(), procs: Vec::new(), gpu_source: None, gpu_note: Some("falhou".into()) })
}

#[cfg(not(any(target_os = "linux", windows)))]
async fn sample_raw() -> Raw {
    Raw { at: Instant::now(), procs: Vec::new(), gpu_source: None, gpu_note: Some("só Linux e Windows por enquanto".into()) }
}

#[cfg(target_os = "linux")]
fn total_memory() -> Option<u64> {
    linux::total_memory()
}
#[cfg(windows)]
fn total_memory() -> Option<u64> {
    win::total_memory()
}
#[cfg(not(any(target_os = "linux", windows)))]
fn total_memory() -> Option<u64> {
    None
}

/// transforma a leitura crua em % comparando com a anterior (e guarda esta pra próxima vez)
fn compute(raw: Raw, prev: &Prev) -> (Snapshot, Prev) {
    let wall_ns = raw.at.duration_since(prev.at).as_nanos().max(1) as f64;
    let cpus = cpu_count();
    let mut next = Prev { at: raw.at, cpu: HashMap::new(), engines: HashMap::new() };
    let mut processes = Vec::new();
    for p in raw.procs {
        let cpu_percent = p.cpu_ns.and_then(|now| {
            next.cpu.insert(p.pid, now);
            let before = prev.cpu.get(&p.pid)?;
            Some((now.saturating_sub(*before) as f64 / wall_ns / cpus as f64 * 100.0).clamp(0.0, 100.0))
        });
        let mut gpu_percent = p.gpu_percent;
        for (key, c) in &p.gpu_engines {
            next.engines.insert((p.pid, key.clone()), *c);
            let Some(b) = prev.engines.get(&(p.pid, key.clone())) else { continue };
            let util = match (c.busy_ns, b.busy_ns, c.cycles, b.cycles, c.total_cycles, b.total_cycles) {
                (Some(n), Some(o), ..) => Some(n.saturating_sub(o) as f64 / wall_ns * 100.0),
                (_, _, Some(cn), Some(co), Some(tn), Some(to)) if tn > to => Some(cn.saturating_sub(co) as f64 / (tn - to) as f64 * 100.0),
                _ => None,
            };
            if let Some(u) = util {
                let u = u.clamp(0.0, 100.0);
                gpu_percent = Some(gpu_percent.map_or(u, |g| g.max(u)));
            }
        }
        // tem placa (fdinfo) mas o motor ainda não tinha leitura anterior: 0 por enquanto
        if gpu_percent.is_none() && !p.gpu_engines.is_empty() {
            gpu_percent = Some(0.0);
        }
        processes.push(ProcInfo {
            pid: p.pid,
            ppid: p.ppid,
            name: p.name,
            role: p.role,
            cpu_percent,
            memory_bytes: p.memory,
            gpu_percent,
            gpu_memory_bytes: p.gpu_memory,
        });
    }
    let snap = Snapshot {
        os: if cfg!(windows) { "windows" } else if cfg!(target_os = "linux") { "linux" } else { "outro" },
        cpus,
        total_memory_bytes: total_memory(),
        memory_kind: if cfg!(windows) { "privada" } else { "PSS" },
        gpu_source: raw.gpu_source,
        gpu_note: raw.gpu_note,
        processes,
    };
    (snap, next)
}

fn to_prev(raw: &Raw) -> Prev {
    let mut p = Prev { at: raw.at, cpu: HashMap::new(), engines: HashMap::new() };
    for proc_ in &raw.procs {
        if let Some(c) = proc_.cpu_ns {
            p.cpu.insert(proc_.pid, c);
        }
        for (k, c) in &proc_.gpu_engines {
            p.engines.insert((proc_.pid, k.clone()), *c);
        }
    }
    p
}

/// um retrato de agora. A página chama a cada ~2 s com a aba aberta; a % é sobre o intervalo
/// desde a chamada anterior (primeira vez, ou depois de muito tempo parado: mede 0,5 s na hora).
#[tauri::command]
pub async fn perf_snapshot(app: AppHandle, webview: Webview) -> Result<Snapshot, String> {
    app::require_site(&app, &webview)?;
    let stale = PREV.lock().unwrap().as_ref().map(|p| p.at.elapsed() > Duration::from_secs(10)).unwrap_or(true);
    if stale {
        let first = sample_raw().await;
        *PREV.lock().unwrap() = Some(to_prev(&first));
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    let raw = sample_raw().await;
    let mut guard = PREV.lock().unwrap();
    let prev = guard.take().unwrap_or_else(|| to_prev(&raw));
    let (snap, next) = compute(raw, &prev);
    *guard = Some(next);
    Ok(snap)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arvore() {
        let all = [(1, 0), (10, 1), (11, 10), (12, 10), (13, 11), (20, 1), (21, 99)];
        assert_eq!(descendants(10, &all), vec![10, 11, 12, 13]);
        assert_eq!(descendants(20, &all), vec![20]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn le_o_proprio_processo() {
        let procs = linux::sample();
        let me = procs.iter().find(|p| p.pid == std::process::id()).expect("o próprio processo");
        assert_eq!(me.role, "app (Rust)");
        assert!(me.cpu_ns.is_some());
        assert!(me.memory.unwrap_or(0) > 0);
    }

    #[test]
    fn porcentagem_de_cpu() {
        let t0 = Instant::now();
        let prev = Prev { at: t0, cpu: HashMap::from([(1, 0)]), engines: HashMap::new() };
        let raw = Raw {
            at: t0 + Duration::from_secs(1),
            procs: vec![RawProc { pid: 1, cpu_ns: Some(1_000_000_000), ..Default::default() }],
            gpu_source: None,
            gpu_note: None,
        };
        let (snap, _) = compute(raw, &prev);
        let pct = snap.processes[0].cpu_percent.unwrap();
        // 1 núcleo inteiro por 1 s = 100% / núcleos
        assert!((pct - 100.0 / cpu_count() as f64).abs() < 0.01, "{pct}");
    }
}
