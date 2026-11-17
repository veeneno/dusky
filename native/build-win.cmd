@echo off
rem compila o auxiliar de audio no Windows com o MSVC.
rem rode de dentro do "x64 Native Tools Command Prompt for VS" (vem com o Visual Studio Build Tools,
rem carga de trabalho "Desenvolvimento para desktop com C++").
setlocal
cd /d "%~dp0"
if not exist bin mkdir bin
cl /nologo /O2 /EHsc /std:c++17 /W3 audiocap.cpp /Fe:bin\dusky-audiocap.exe /Fo:bin\ ole32.lib mmdevapi.lib avrt.lib version.lib
if errorlevel 1 exit /b 1
del /q bin\*.obj 2>nul
echo ok: %cd%\bin\dusky-audiocap.exe
