!macro customInstall
  SetRegView 64
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  StrCmp $0 "1" vcredist_ok 0
    MessageBox MB_OK|MB_ICONINFORMATION "إذا لم يفتح البرنامج بعد التثبيت، ثبّت Microsoft Visual C++ Redistributable 2015-2022 (x64) من موقع مايكروسوفت ثم أعد تشغيل الجهاز."
  vcredist_ok:
!macroend
