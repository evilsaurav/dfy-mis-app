import urllib.request
import json

try:
    req = urllib.request.urlopen("https://dfy-mis-app.onrender.com/staff-directory")
    res = req.read()
    print(res.decode('utf-8'))
except Exception as e:
    print(e)
