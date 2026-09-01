# -*- coding: utf-8 -*-
with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add PWA Install state and handlers
state_marker = "  const [isSubmitting, setIsSubmitting] = useState(false);"
pwa_state_code = """  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(true);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setShowInstallBtn(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setShowInstallBtn(false);
        showToast("DFY MIS App install ho gayi hai!", "success");
      }
      setDeferredPrompt(null);
    } else {
      setShowIosInstallModal(true);
    }
  };"""

if state_marker in text:
    text = text.replace(state_marker, pwa_state_code)
    print("PWA state and handlers added")
else:
    print("state_marker not found")

# 2. Add Install App Banner to Login Screen right before District selection
login_screen_marker = '<div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 border border-slate-100">'
pwa_banner_code = """            {/* PWA Install Banner */}
            {showInstallBtn && (
              <div className="mb-5 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-xl shadow-indigo-500/20 border border-indigo-400/30 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shrink-0">
                    📲
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black tracking-wide leading-tight">Install Mobile App</h4>
                    <p className="text-[10px] text-indigo-100 font-medium">Home screen par 1-click access</p>
                  </div>
                </div>
                <button 
                  onClick={handleInstallApp}
                  className="bg-white text-indigo-700 hover:bg-indigo-50 font-black text-[11px] sm:text-xs px-3.5 py-2 rounded-xl shadow-md active:scale-95 transition-all shrink-0 uppercase tracking-wider"
                >
                  Install
                </button>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 border border-slate-100">"""

if login_screen_marker in text:
    text = text.replace(login_screen_marker, pwa_banner_code)
    print("pwa_banner_code added to Login Screen")
else:
    print("login_screen_marker not found")

# 3. Add Header Install App button
header_marker = '<div className="bg-indigo-50 text-indigo-600 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold border border-indigo-100 shadow-sm tracking-wider">v3.1</div>'
pwa_header_btn = """<button onClick={handleInstallApp} className="flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold shadow-sm transition-all active:scale-95" title="Install App">
              <span>📲</span>
              <span className="hidden xs:inline">Install App</span>
            </button>
            <div className="bg-indigo-50 text-indigo-600 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold border border-indigo-100 shadow-sm tracking-wider">v3.1</div>"""

if header_marker in text:
    text = text.replace(header_marker, pwa_header_btn)
    print("pwa_header_btn added to Header")
else:
    print("header_marker not found")

# 4. Add iOS / Manual Install Guide Modal before the end of App component
modal_inject_marker = "      {/* Branding Footer */}"
ios_modal_code = """      {/* iOS / Manual Install Modal */}
      {showIosInstallModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-slate-100 text-center animate-fade-in">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 font-black">
              📲
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">App Install Guide</h3>
            <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed">
              Apne mobile home screen par is app ko add karne ke liye:
            </p>

            <div className="text-left space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-700 mb-6">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>Chrome ya Safari me <strong>Share (📤)</strong> ya <strong>3-dots (⋮)</strong> par click karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span><strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par tap karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>App aapke mobile phone me install ho jayegi! 🎉</span>
              </div>
            </div>

            <button 
              onClick={() => setShowIosInstallModal(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              Samajh Gaya (Close)
            </button>
          </div>
        </div>
      )}

      {/* Branding Footer */}"""

if modal_inject_marker in text:
    text = text.replace(modal_inject_marker, ios_modal_code)
    print("ios_modal_code added")
else:
    print("modal_inject_marker not found")

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
