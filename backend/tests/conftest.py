import pytest
import requests
import os

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def base_url():
    """Get base URL from environment"""
    return os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

@pytest.fixture
def admin_credentials():
    """Admin credentials for testing"""
    return {
        "email": "admin@earnaflow.com",
        "password": "admin123"
    }

@pytest.fixture
def admin_token(api_client, base_url, admin_credentials):
    """Get admin access token"""
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json=admin_credentials
    )
    if response.status_code == 200:
        return response.json().get('access_token')
    return None
