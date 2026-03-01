FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and YOLO
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:/root/.local/bin:$PATH"

# Copy project definition and install deps
COPY pyproject.toml .

# Fix large dependency downloads (onnxruntime)
ENV UV_HTTP_TIMEOUT=600
ENV UV_HTTP_RETRIES=10

RUN uv sync

# Copy application code
COPY . .

# Pre-download YOLO models (speeds up first run)
RUN uv run python -c "from ultralytics import YOLO; YOLO('yolo11n.pt'); YOLO('yolo11n-pose.pt')" || true

CMD ["bash"]
