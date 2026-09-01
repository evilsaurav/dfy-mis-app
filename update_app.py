import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the initialDirectory block with dynamic fetch
pattern = r'''  const initialDirectory = \{.*?^\s*\};\s*const \[directory, setDirectory\] = useState\(initialDirectory\);\s*const \[districts, setDistricts\] = useState\(Object\.keys\(initialDirectory\)\);'''

replacement = r'''  const [directory, setDirectory] = useState({});
  const [districts, setDistricts] = useState([]);
  
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/staff-directory`);
        const data = await res.json();
        if (data.status === 'success') {
          setDirectory(data.data);
          setDistricts(Object.keys(data.data).sort());
        }
      } catch (err) {
        console.error("Failed to fetch staff directory", err);
      }
    };
    fetchDirectory();
  }, []);'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL | re.MULTILINE)

if new_content == content:
    print("WARNING: Could not find block in App.jsx")
else:
    with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated App.jsx")
