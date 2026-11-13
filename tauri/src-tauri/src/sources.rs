//! Telas e janelas que dá pra compartilhar (o que o desktopCapturer do Electron fazia), com miniatura.
//!
//! Linux (X11): RandR pros monitores, _NET_CLIENT_LIST pras janelas, GetImage pras miniaturas.
//! Wayland não deixa nenhum app listar nada — lá o seletor do sistema (portal) é aberto pelo auxiliar
//! didiscord-screencast e este módulo nem é usado.
//! Windows: crate xcap (lista e captura uma imagem de cada).

use base64::Engine;
use image::{imageops::FilterType, DynamicImage, RgbImage};
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Screen,
    Window,
}

/// O que o compartilhamento precisa saber da fonte escolhida.
#[derive(Clone, Debug)]
pub struct Source {
    /// "screen:<n>" ou "window:<id da janela>" (mesmo formato do Electron)
    pub id: String,
    pub name: String,
    pub kind: Kind,
    /// posição na lista de monitores (Windows: output_idx do ddagrab)
    pub index: usize,
    /// área do monitor em pixels físicos
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// XID (X11) ou HWND (Windows)
    pub window_id: u64,
    /// processo dono da janela (pro áudio "só desse app")
    pub pid: Option<u32>,
}

/// O que vai pro picker.html.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub thumbnail: String,
    pub app_icon: Option<String>,
}

pub fn view(s: &Source, thumbnail: String) -> SourceView {
    SourceView {
        id: s.id.clone(),
        name: s.name.clone(),
        kind: if s.kind == Kind::Screen { "screen" } else { "window" },
        thumbnail,
        app_icon: None,
    }
}

const THUMB_W: u32 = 320;
const THUMB_H: u32 = 180;

/// imagem -> miniatura 320x180 (proporção mantida) em JPEG, como data: URL
pub fn thumb_data_url(img: DynamicImage) -> String {
    let small = img.resize(THUMB_W, THUMB_H, FilterType::Triangle).to_rgb8();
    let mut buf = std::io::Cursor::new(Vec::new());
    if small.write_to(&mut buf, image::ImageFormat::Jpeg).is_err() {
        return String::new();
    }
    format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(buf.into_inner()))
}

/// miniatura cinza (janela que não deu pra capturar, ex: minimizada)
pub fn placeholder() -> String {
    thumb_data_url(DynamicImage::ImageRgb8(RgbImage::from_pixel(THUMB_W, THUMB_H, image::Rgb([43, 45, 49]))))
}

/// Lista tudo (com miniaturas). Demora um pouco — chamar fora da thread principal.
pub fn list(own_pid: u32) -> Vec<(Source, SourceView)> {
    match platform::list(own_pid) {
        Ok(v) => v,
        Err(err) => {
            crate::server::log::warn(&format!("não consegui listar telas/janelas: {err}"));
            Vec::new()
        }
    }
}

// ======================================================================================= Linux (X11)

#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use x11rb::connection::Connection;
    use x11rb::protocol::randr::ConnectionExt as _;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, ImageFormat, MapState, Window};

    type Res<T> = Result<T, Box<dyn std::error::Error>>;

    fn atom(conn: &impl Connection, name: &str) -> Res<u32> {
        Ok(conn.intern_atom(false, name.as_bytes())?.reply()?.atom)
    }

    fn prop_bytes(conn: &impl Connection, win: Window, prop: u32, ty: u32) -> Option<Vec<u8>> {
        let r = conn.get_property(false, win, prop, ty, 0, 4096).ok()?.reply().ok()?;
        (!r.value.is_empty()).then_some(r.value)
    }

    fn prop_u32s(conn: &impl Connection, win: Window, prop: u32) -> Vec<u32> {
        conn.get_property(false, win, prop, AtomEnum::ANY, 0, u32::MAX / 4)
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().map(|v| v.collect()))
            .unwrap_or_default()
    }

    /// GetImage (ZPixmap, 32 bits por pixel = B,G,R,X) -> imagem RGB
    fn grab(conn: &impl Connection, drawable: u32, x: i16, y: i16, w: u16, h: u16) -> Option<DynamicImage> {
        if w == 0 || h == 0 {
            return None;
        }
        let reply = conn.get_image(ImageFormat::Z_PIXMAP, drawable, x, y, w, h, !0).ok()?.reply().ok()?;
        let bpp = conn.setup().pixmap_formats.iter().find(|f| f.depth == reply.depth).map(|f| f.bits_per_pixel)?;
        if bpp != 32 || reply.data.len() < w as usize * h as usize * 4 {
            return None;
        }
        let mut rgb = Vec::with_capacity(w as usize * h as usize * 3);
        for px in reply.data.chunks_exact(4).take(w as usize * h as usize) {
            rgb.extend_from_slice(&[px[2], px[1], px[0]]);
        }
        RgbImage::from_raw(w as u32, h as u32, rgb).map(DynamicImage::ImageRgb8)
    }

    pub fn list(own_pid: u32) -> Res<Vec<(Source, SourceView)>> {
        if std::env::var_os("DISPLAY").is_none() {
            return Err("sem DISPLAY do X11".into());
        }
        let (conn, screen_num) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen_num].root;
        let mut out = Vec::new();

        // ---------- monitores ----------
        let monitors = conn.randr_get_monitors(root, true)?.reply()?.monitors;
        for (i, m) in monitors.iter().enumerate() {
            let name = conn
                .get_atom_name(m.name)
                .ok()
                .and_then(|c| c.reply().ok())
                .map(|r| String::from_utf8_lossy(&r.name).into_owned())
                .unwrap_or_default();
            let label = if monitors.len() == 1 { "Tela inteira".to_string() } else { format!("Tela {} ({name})", i + 1) };
            let src = Source {
                id: format!("screen:{i}"),
                name: label,
                kind: Kind::Screen,
                index: i,
                x: m.x as i32,
                y: m.y as i32,
                width: m.width as u32,
                height: m.height as u32,
                window_id: 0,
                pid: None,
            };
            let thumb = grab(&conn, root, m.x, m.y, m.width, m.height).map(thumb_data_url).unwrap_or_else(placeholder);
            out.push((src.clone(), view(&src, thumb)));
        }

        // ---------- janelas ----------
        let net_client_list = atom(&conn, "_NET_CLIENT_LIST")?;
        let net_wm_name = atom(&conn, "_NET_WM_NAME")?;
        let utf8 = atom(&conn, "UTF8_STRING")?;
        let net_wm_pid = atom(&conn, "_NET_WM_PID")?;
        for win in prop_u32s(&conn, root, net_client_list) {
            let viewable = conn
                .get_window_attributes(win)
                .ok()
                .and_then(|c| c.reply().ok())
                .map(|a| a.map_state == MapState::VIEWABLE)
                .unwrap_or(false);
            if !viewable {
                continue; // minimizada / em outra área de trabalho
            }
            let pid = prop_u32s(&conn, win, net_wm_pid).first().copied();
            if pid == Some(own_pid) {
                continue; // o próprio didiscord (inclusive o seletor)
            }
            let title = prop_bytes(&conn, win, net_wm_name, utf8)
                .or_else(|| prop_bytes(&conn, win, AtomEnum::WM_NAME.into(), AtomEnum::STRING.into()))
                .map(|b| String::from_utf8_lossy(&b).trim().to_string())
                .unwrap_or_default();
            if title.is_empty() {
                continue;
            }
            let Some(geo) = conn.get_geometry(win).ok().and_then(|c| c.reply().ok()) else { continue };
            let src = Source {
                id: format!("window:{win}"),
                name: title,
                kind: Kind::Window,
                index: 0,
                x: 0,
                y: 0,
                width: geo.width as u32,
                height: geo.height as u32,
                window_id: win as u64,
                pid,
            };
            let thumb = grab(&conn, win, 0, 0, geo.width, geo.height).map(thumb_data_url).unwrap_or_else(placeholder);
            out.push((src.clone(), view(&src, thumb)));
        }
        Ok(out)
    }
}

// ========================================================================================== Windows

#[cfg(windows)]
mod platform {
    use super::*;

    type Res<T> = Result<T, Box<dyn std::error::Error>>;

    pub fn list(own_pid: u32) -> Res<Vec<(Source, SourceView)>> {
        let mut out = Vec::new();
        let monitors = xcap::Monitor::all()?;
        let count = monitors.len();
        for (i, m) in monitors.iter().enumerate() {
            let name = m.friendly_name().or_else(|_| m.name()).unwrap_or_default();
            let src = Source {
                id: format!("screen:{i}"),
                name: if count == 1 { "Tela inteira".into() } else { format!("Tela {} ({name})", i + 1) },
                kind: Kind::Screen,
                index: i,
                x: m.x().unwrap_or(0),
                y: m.y().unwrap_or(0),
                width: m.width().unwrap_or(1920),
                height: m.height().unwrap_or(1080),
                window_id: 0,
                pid: None,
            };
            let thumb = m.capture_image().map(|img| thumb_data_url(DynamicImage::ImageRgba8(img))).unwrap_or_else(|_| placeholder());
            out.push((src.clone(), view(&src, thumb)));
        }
        for w in xcap::Window::all()? {
            if w.is_minimized().unwrap_or(false) {
                continue;
            }
            let pid = w.pid().ok();
            if pid == Some(own_pid) {
                continue;
            }
            let title = w.title().unwrap_or_default().trim().to_string();
            if title.is_empty() {
                continue;
            }
            let Ok(id) = w.id() else { continue };
            let src = Source {
                id: format!("window:{id}"),
                name: title,
                kind: Kind::Window,
                index: 0,
                x: 0,
                y: 0,
                width: w.width().unwrap_or(0),
                height: w.height().unwrap_or(0),
                window_id: id as u64,
                pid,
            };
            let thumb = w.capture_image().map(|img| thumb_data_url(DynamicImage::ImageRgba8(img))).unwrap_or_else(|_| placeholder());
            out.push((src.clone(), view(&src, thumb)));
        }
        Ok(out)
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    use super::*;
    pub fn list(_own_pid: u32) -> Result<Vec<(Source, SourceView)>, String> {
        Err("só Linux e Windows por enquanto".into())
    }
}

#[cfg(test)]
mod tests {
    /// precisa de uma tela (X11): `cargo test -- --ignored lista_fontes --nocapture`
    #[test]
    #[ignore]
    fn lista_fontes() {
        for (s, v) in super::list(std::process::id()) {
            println!("{} | {} | {}x{}+{}+{} | pid {:?} | miniatura {} bytes", s.id, s.name, s.width, s.height, s.x, s.y, s.pid, v.thumbnail.len());
        }
    }
}
