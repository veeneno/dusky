; Ganchos do instalador NSIS do dusky (tauri.windows.conf.json → bundle.windows.nsis.installerHooks).
;
; Migração do app antigo (Electron, instalado como "didiscord"): o atualizador do Electron baixa ESTE
; instalador (pelo latest.yml, ver tauri/scripts/release.js) e roda com "--updated" (e "/S" quando
; instala ao sair do app). Depois de instalar o dusky novo:
;   1. desinstala o Electron em silêncio — o desinstalador dele não apaga a pasta de dados
;      (%APPDATA%\didiscord), de onde o app novo traz o endereço do servidor e as preferências;
;   2. se veio do atualizador em modo silencioso, abre o app novo (o Electron esperava reabrir).
; Quem instala do zero (sem Electron) não passa por nada disso.

!include "FileFunc.nsh"

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4

  ; procura o "didiscord ..." na lista de programas instalados da conta (o Electron era por usuário)
  StrCpy $0 0
  dusky_legacy_next:
    EnumRegKey $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" dusky_legacy_done
    IntOp $0 $0 + 1
    ReadRegStr $2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    StrCpy $3 $2 9
    StrCmp $3 "didiscord" 0 dusky_legacy_next
    ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "QuietUninstallString"
    StrCmp $4 "" 0 dusky_legacy_run
    ReadRegStr $4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    StrCmp $4 "" dusky_legacy_done
    StrCpy $4 "$4 /S"
  dusky_legacy_run:
    DetailPrint "Removendo o app antigo ($2)…"
    ; fecha o Electron antes: aberto, a desinstalação silenciosa dele pode falhar e ele continuava
    ; rodando junto com o app novo (o som dele entrava no áudio da tela). nsExec = sem janela preta.
    ; Sem /T: na migração este instalador é filho do próprio Electron e cairia junto.
    nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM didiscord.exe'
    Pop $3
    Sleep 800
    ExecWait '$4'
  dusky_legacy_done:

  ; veio do atualizador do Electron em silêncio: abre o app novo
  ${GetParameters} $1
  ClearErrors
  ${GetOptions} $1 "--updated" $2
  IfErrors dusky_no_relaunch
  IfSilent 0 dusky_no_relaunch
    Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  dusky_no_relaunch:

  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
