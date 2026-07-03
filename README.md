# Jupyter Extension for Learning Analytics (LA)

This repository contains the research codebase, datasets, and academic papers for a **Learning Analytics** project developed during my exchange semester at the **Universität Duisburg-Essen (UDE)**, Germany. 

The core of the project is a custom Jupyter Notebook extension designed to track, analyze, and present real-time learning behavior analytics. The resulting paper was submitted to the **MUC (Mensch und Computer) Student Research Competition**, one of the premier conferences for Human-Computer Interaction (HCI) in Europe.

---

## 🏛️ Project Lifecycle & Repository Structure

Following rigorous academic and open-science standards, the repository is structured into distinct research phases:

### 🔧 Development & Data
*   📁 **`JupyterExtension/`**: The implementation source code of the custom Jupyter Notebook extension developed to track and analyze student telemetry, interactions, or coding patterns.
*   📁 **`Final_DataBases/`**: Anonymized databases and datasets processed during the evaluation and benchmarking phases of the extension.

### 📝 Research & Publications
*   📁 **`Research Proposal/`**: The initial conceptual framework, literature review, and methodology design approved at the beginning of the course.
*   📄 **`Ethics Approval.pdf`**: Official institutional review board/ethics committee clearance required to legally and ethically track user telemetry and process learning analytics data.
*   📁 **`Final Paper/`**: The comprehensive final research paper detailing the extension's architecture, user study findings, and statistical insights.
*   📁 **`MUC - StudentResearchCompetition/`**: Adapted research paper format, slides, or submission materials tailored for the **Mensch und Computer** conference track.

---

## 🚀 Quick Start & Deployment

This repository includes a full infrastructure automation pipeline to build the environment, initialize the relational databases, and deploy the JupyterLab server with the preconfigured extension in a single command.

### Prerequisites
*   **Docker** installed and running on your system.
*   **Docker Compose** (or native support via `docker compose`).

### Launching the Experiment

1. Clone this repository and navigate to the root directory.
2. Run the deployment script corresponding to your operating system to boot the entire stack:

   * **On Linux / macOS:**
     ```bash
     chmod +x start_study.sh
     ./start_study.sh
     ```
   * **On Windows (Command Prompt / PowerShell):**
     ```cmd
     start_study.bat
     ```

---

## 🛠️ Technologies & Research Domains
*   **Domain Expertise:** Learning Analytics (LA), Human-Computer Interaction (HCI), Educational Data Mining (EDM).
*   **Extension Ecosystem:** JavaScript / TypeScript / Python (Jupyter Notebook / JupyterLab Extension architecture).
*   **Data Science Stack:** SQL / Pandas / Data Pipelines for telemetry logging and behavioral data processing.

---

## 🎓 Credits & Affiliation
*   **Author:** Arturo Olivares Martos
*   **Institution:** Universität Duisburg-Essen (UDE) — Duisburg, Germany
*   **Course:** Learning Analytics
*   **Target Venue:** Mensch und Computer (MuC) — Student Research Competition