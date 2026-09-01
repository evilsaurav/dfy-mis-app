with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

target_endpoints = """
class TargetUpdate(BaseModel):
    district: str
    fo_name: str
    target: int

@app.get("/get-targets")
async def get_targets(district: str = None):
    try:
        targets = []
        docs = db.collection("staff_targets").stream()
        for doc in docs:
            data = doc.to_dict()
            if district and data.get("district") != district:
                continue
            targets.append({
                "fo_name": data.get("fo_name"),
                "district": data.get("district"),
                "target": data.get("target", 0)
            })
        return {"success": True, "targets": targets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update-target")
async def update_target(data: TargetUpdate):
    try:
        doc_id = f"{data.district}_{data.fo_name}".replace(" ", "").lower()
        db.collection("staff_targets").document(doc_id).set({
            "district": data.district,
            "fo_name": data.fo_name,
            "target": data.target
        }, merge=True)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""

text = text.replace("@app.get(\"/download-kpi-workbook\")", target_endpoints + "\n@app.get(\"/download-kpi-workbook\")")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

