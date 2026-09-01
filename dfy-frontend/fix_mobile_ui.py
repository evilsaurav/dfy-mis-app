with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# Fix the outermost container:
# <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center ...">
text = text.replace(
    '<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-4 px-2 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden w-full">',
    '<div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 w-full overflow-x-hidden">'
)

text = text.replace(
    '<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">',
    '<div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 w-full overflow-x-hidden">'
)

text = text.replace(
    '<main className={`max-w-4xl mx-auto px-1 sm:p-6 w-[95%] sm:w-full flex-1 flex flex-col overflow-x-hidden ${!isLoggedIn ? "justify-center" : "mt-2"}`}>',
    '<main className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "justify-center py-10" : "py-6"}`}>'
)

text = text.replace(
    '<main className={`max-w-4xl mx-auto p-4 sm:p-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "justify-center mt-[-2rem]" : "mt-2"}`}>',
    '<main className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "justify-center py-10" : "py-6"}`}>'
)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

