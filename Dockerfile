# Written with AI assistance (Claude).
# Planner web service image (works on Hugging Face Spaces, Render, or any Docker host).
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir numpy scipy scikit-image fastapi "uvicorn[standard]" jsonschema
COPY contracts/ contracts/
COPY pipeline/ pipeline/
COPY terrain/out/ terrain/out/
ENV PORT=7860
EXPOSE 7860
CMD uvicorn pipeline.api:app --host 0.0.0.0 --port ${PORT}
