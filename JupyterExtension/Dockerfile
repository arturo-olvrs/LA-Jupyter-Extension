FROM jupyter/base-notebook:latest

USER root
RUN apt-get update && apt-get install -y nodejs npm sqlite3 && apt-get clean
RUN mkdir -p /data && chown -R jovyan:users /data

COPY . /home/jovyan/LA_Jupyter_Extension
RUN chown -R jovyan:users /home/jovyan/LA_Jupyter_Extension

USER jovyan
WORKDIR /home/jovyan/LA_Jupyter_Extension

RUN pip install --no-cache-dir git+https://github.com/KaiYakexi/jupy-cell-lock.git
RUN pip install --no-cache-dir -U "jupyterlab>=4.3.0,<5"
# Compilación del frontend
RUN jlpm install && jlpm build
# Instalación de la extensión
RUN pip install --no-cache-dir .

EXPOSE 8888