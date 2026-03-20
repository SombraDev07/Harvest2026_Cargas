import requests
import json

def test_login():
    url = "https://harvest2026cargas.com.br/api/login"
    # Wait, let's look for the actual URL in the frontend or PROJECT_STATUS.md
    payload = {
        "username": "amandadasilva.estevam@bureauveritas.co",
        "password": "kuhlmann2"
    }
    print(f"Testando login em {url}...")
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Erro ao testar API: {e}")

if __name__ == "__main__":
    test_login()
