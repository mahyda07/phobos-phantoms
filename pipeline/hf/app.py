# Written with AI assistance (Claude).
"""Hugging Face Space entry point (Gradio SDK). Track [P5].

Serves the planner web service (pipeline/api.py: /health, /stops, /layers, /route/demo, /window, POST /plan, /docs)
and mounts a small Gradio page at "/" so the Space page shows something useful.
The API routes are registered first, so they win over the Gradio mount.
"""
import json

try:
    import spaces  # Hugging Face ZeroGPU helper; import before anything else that could touch CUDA
except ImportError:  # running locally without the spaces package
    spaces = None

import gradio as gr
import uvicorn

from pipeline.api import app, health, planner

if spaces is not None:
    @spaces.GPU(duration=5)
    def gpu_ping():
        """ZeroGPU hardware refuses to start a Space without at least one @spaces.GPU function.
        The planner itself runs on CPU; this function is never called by the service."""
        return "ok"


EXAMPLE = {"frame": "jezero-local-v1", "start": [429.15, -1438.46], "end": [1000, -1300],
           "stops": ["S1", "S3"], "use_hazard": True}


def try_plan(body_text):
    """Run the same planner the API uses and summarise the reply."""
    try:
        body = json.loads(body_text)
        route = planner.plan(body["start"], body["end"], body.get("stops", []), body.get("use_hazard", True))
        props = route.get("properties", {})
        short = {k: props[k] for k in list(props)[:12]}
        return json.dumps(short, indent=2)
    except Exception as e:  # show the error on the page instead of crashing
        return f"error: {e}"


with gr.Blocks(title="Phobos Planner") as demo:
    gr.Markdown(
        "# Phobos Planner · Phobos Phantoms OG 7.66\n"
        "Marswalk route planner for a 1.5 × 1.5 km area of Jezero Crater (NASA Space Apps Challenge 2026).\n\n"
        "API: `GET /health`, `GET /stops`, `GET /route/demo`, `GET /window`, `GET /results`, `POST /plan` · interactive docs at **/docs**. "
        "Current planner is a stand-in (route ids start with `standin-`).")
    gr.JSON(value=health(), label="GET /health")
    box = gr.Code(value=json.dumps(EXAMPLE, indent=2), language="json", label="POST /plan body")
    out = gr.Code(language="json", label="Route summary (properties)")
    gr.Button("Plan route").click(try_plan, inputs=box, outputs=out)

app = gr.mount_gradio_app(app, demo, path="/")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)
