import React from 'react';

export default function AdminLogin({
  loginUsername,
  setLoginUsername,
  password,
  setPassword,
  error,
  handleLogin
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-slate-100/60 flex items-center justify-center p-4 font-sans">
      <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-[0_20px_50px_rgba(79,70,229,0.07)] w-full max-w-md border border-slate-200/80 animate-fade-in-down">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-white border border-slate-200/90 rounded-2xl flex items-center justify-center p-1.5 mx-auto mb-3 shadow-md shadow-teal-900/10">
            <img src="/dfy-logo.png" alt="Doctors For You Logo" className="w-full h-full object-contain" />
          </div>
          <div className="inline-block bg-teal-50 text-teal-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-teal-200 mb-1.5">
            Doctors For You
          </div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Admin Portal</h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1">State Health MIS Management</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-0.5">Username / Admin ID</label>
            <input 
              type="text" 
              value={loginUsername} 
              onChange={(e) => setLoginUsername(e.target.value)} 
              placeholder="e.g. admin or mis_buxar" 
              className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-2xs" 
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-0.5">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Enter password" 
              className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-2xs" 
            />
          </div>

          {error && <p className="text-rose-600 text-xs font-bold text-center bg-rose-50/90 p-2.5 rounded-xl border border-rose-200/80 animate-fade-in">{error}</p>}

          <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black py-3.5 rounded-xl shadow-md shadow-indigo-600/25 hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.98] transition-all text-xs uppercase tracking-wider cursor-pointer">
            Enter Admin Portal &rarr;
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3">
          <button onClick={() => window.location.href = '/'} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            &larr; Back to Field Officer App
          </button>
        </div>
      </div>
    </div>
  );
}
