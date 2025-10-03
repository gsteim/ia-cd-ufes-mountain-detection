from flask import Flask, render_template, request, jsonify
import os
import cv2
import numpy as np
import uuid
import duckdb
import hashlib
import json
import threading
from werkzeug.utils import secure_filename
import torch
from segment_anything import sam_model_registry, SamPredictor
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = os.path.join(app.root_path, 'uploads')
STATIC_FOLDER = os.path.join(app.root_path, 'static')
DB_PATH = os.path.join(app.root_path, 'mountain_cache.duckdb')

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(STATIC_FOLDER, exist_ok=True)

duckdb_lock = threading.Lock()

# Inicializa o banco
with duckdb_lock:
    with duckdb.connect(DB_PATH) as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS image_cache (
                image_hash TEXT PRIMARY KEY,
                image_data BLOB,
                result_image_path TEXT,
                polygons TEXT,
                image_width INTEGER,
                image_height INTEGER
            )
        """)

def hash_image(filepath):
    with open(filepath, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()

def check_cache(image_path):
    image_hash = hash_image(image_path)
    with duckdb_lock:
        with duckdb.connect(DB_PATH) as con:
            result = con.execute(
                "SELECT result_image_path, polygons, image_width, image_height FROM image_cache WHERE image_hash = ?",
                (image_hash,)
            ).fetchone()
    return result  # pode retornar None ou tuple

def save_to_cache(image_path, result_image_path, polygons, width, height):
    image_hash = hash_image(image_path)
    with open(image_path, 'rb') as f:
        image_data = f.read()
    with duckdb_lock:
        with duckdb.connect(DB_PATH) as con:
            con.execute(
                "INSERT INTO image_cache (image_hash, image_data, result_image_path, polygons, image_width, image_height) VALUES (?, ?, ?, ?, ?, ?)",
                (image_hash, image_data, result_image_path, json.dumps(polygons), width, height)
            )

# Segment Anything setup
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
sam = sam_model_registry["vit_b"](checkpoint="E:/Codigos/python/Gemini/mountain-detection/sam_vit_b_01ec64.pth")
sam.to(device=DEVICE)
predictor = SamPredictor(sam)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        if 'image' not in request.files:
            return jsonify({"error": "Nenhuma imagem enviada"}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({"error": "Nome de ficheiro inválido"}), 400

        # Query param opcional
        show_polygon = request.args.get('showPolygon', 'false').lower() == 'true'

        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

        image = cv2.imread(filepath)
        if image is None:
            return jsonify({"error": "Não foi possível carregar a imagem"}), 500

        h, w = image.shape[:2]

        # Verificar cache
        cached = check_cache(filepath)
        if cached:
            result_path, polygons_str, w, h = cached
            polygons = json.loads(polygons_str)

            # Recalcular a área do polígono do cache
            max_area = 0
            for poly in polygons:
                contour = np.array(poly).reshape((-1, 1, 2)).astype(np.int32)
                area = cv2.contourArea(contour)
                max_area = max(max_area, area)

            polygon_area_percent = round((max_area / (w * h)) * 100, 2) if max_area > 0 else 0.0

            return jsonify(
                result_image=result_path,
                polygons=polygons,
                image_width=w,
                image_height=h,
                polygon_area_percent=polygon_area_percent
            )

        # Segmentação SAM
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        predictor.set_image(image_rgb)

        input_point = np.array([[w // 2, h // 2]])
        input_label = np.array([1])

        masks, _, _ = predictor.predict(
            point_coords=input_point,
            point_labels=input_label,
            multimask_output=False,
        )

        mask = masks[0].astype(np.uint8) * 255
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        result = image.copy()
        max_area = 0
        best_contour = None

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > max_area:
                max_area = area
                best_contour = contour

        polygons = []
        if best_contour is not None and max_area > 500:
            if show_polygon:
                cv2.drawContours(result, [best_contour], -1, (0, 255, 0), 2)
            poly = best_contour.squeeze().tolist()
            if isinstance(poly[0], int):  # Caso apenas 1 ponto
                poly = [poly]
            polygons.append(poly)

        output_filename = f'result_{uuid.uuid4().hex[:8]}.png'
        output_path = os.path.join(STATIC_FOLDER, output_filename)
        cv2.imwrite(output_path, result)

        result_image_path = f'/static/{output_filename}'
        save_to_cache(filepath, result_image_path, polygons, w, h)

        polygon_area_percent = round((max_area / (w * h)) * 100, 2) if max_area > 0 else 0.0

        return jsonify(
            result_image=result_image_path,
            polygons=polygons,
            image_width=w,
            image_height=h,
            polygon_area_percent=polygon_area_percent
        )

    return render_template('index.html')


if __name__ == '__main__':
    app.run(debug=True)
