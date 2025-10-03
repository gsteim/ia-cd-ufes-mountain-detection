# Detecção de Montanhas (ia-cd-ufes-mountain-detection)

Este repositório contém o código-fonte para o projeto de detecção de montanhas utilizando técnicas de Inteligência Artificial, desenvolvido na especialização em Inteligência Artifical e Ciência de Dados da UFES (Universidade Federal do Espírito Santo).

## Pré-requisitos

Para executar este projeto, você precisará ter o **Python** instalado. Recomenda-se o uso de um ambiente virtual (como `venv` ou `conda`).

## Instalação

Siga os passos abaixo para configurar seu ambiente de desenvolvimento:

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/gsteim/ia-cd-ufes-mountain-detection](https://github.com/gsteim/ia-cd-ufes-mountain-detection)
    cd ia-cd-ufes-mountain-detection
    ```

2.  **Instale as dependências:**
    ```bash
    pip install -r requirements.txt
    ```
    *Obs.: Certifique-se de que o arquivo `requirements.txt` com as dependências do projeto esteja na raiz do repositório.*

## Download do Modelo Pré-treinado (.pth)

### ⚠️ AVISO IMPORTANTE

O arquivo do modelo pré-treinado Segment Anything Model (SAM) **NÃO** está incluído neste repositório devido ao seu tamanho.

**Para que o projeto funcione corretamente, você deve baixar o arquivo `.pth` diretamente do seu [repositório de origem](https://github.com/facebookresearch/segment-anything), conforme indicado pelo autor do projeto.**

Após o download, coloque o arquivo `.pth` no diretório raiz, onde está o arquivo `app.py`.

## Uso

Para executar o servidor localmente:

```bash
python app.py
```


Abra o navegador na página informada no console (normalmente será no link `http://127.0.0.1:5000/`) e navegue na aplicação.

