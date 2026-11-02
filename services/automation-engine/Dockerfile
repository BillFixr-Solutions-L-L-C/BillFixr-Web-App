FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# The demo UI is off in the image. Mount a volume at /app/data to keep the database and revised bill PDFs.
ENV HOST=0.0.0.0 PORT=8000 RELOAD=0 ENABLE_DEMO_UI=0 ENGINE_DB_PATH=/app/data/engine.db ENGINE_DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 8000
CMD ["python", "server.py"]
