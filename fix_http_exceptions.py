with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

import re

# Replace `except Exception as e:` with `except HTTPException:\n        raise\n    except Exception as e:`
# where not already preceded by except HTTPException
pattern = r'(?<!except HTTPException:\n        raise\n)    except Exception as e:'
text = re.sub(pattern, '    except HTTPException:\n        raise\n    except Exception as e:', text)

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

print("Updated HTTPException handling in main.py")
