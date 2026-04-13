import pytest
import requests

class TestAuth:
    """Authentication endpoint tests"""

    def test_login_success(self, api_client, base_url, admin_credentials):
        """Test successful login with admin credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json=admin_credentials
        )
        print(f"Login response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Login response data keys: {data.keys()}")
        assert "access_token" in data, "access_token not in response"
        assert "id" in data, "id not in response"
        assert "email" in data, "email not in response"
        assert data["email"] == admin_credentials["email"], "Email mismatch"
        assert data["role"] == "admin", "Role should be admin"
        print("✓ Login successful")

    def test_login_invalid_credentials(self, api_client, base_url):
        """Test login with invalid credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json={"email": "admin@earnaflow.com", "password": "wrongpassword"}
        )
        print(f"Invalid login response status: {response.status_code}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid credentials rejected")

    def test_register_new_user(self, api_client, base_url):
        """Test user registration"""
        import uuid
        test_email = f"test_{uuid.uuid4().hex[:8]}@earnaflow.com"
        
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": test_email,
                "password": "testpass123",
                "name": "Test User"
            }
        )
        print(f"Register response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "access_token not in response"
        assert data["email"] == test_email, "Email mismatch"
        assert data["role"] == "user", "Role should be user"
        print(f"✓ User registered: {test_email}")

    def test_register_duplicate_email(self, api_client, base_url, admin_credentials):
        """Test registration with existing email"""
        response = api_client.post(
            f"{base_url}/api/auth/register",
            json={
                "email": admin_credentials["email"],
                "password": "testpass123",
                "name": "Duplicate User"
            }
        )
        print(f"Duplicate email response status: {response.status_code}")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate email rejected")

    def test_get_current_user(self, api_client, base_url, admin_token):
        """Test getting current user info"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        response = api_client.get(
            f"{base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get me response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "email" in data, "email not in response"
        assert data["email"] == "admin@earnaflow.com", "Email mismatch"
        print("✓ Current user retrieved")

    def test_logout(self, api_client, base_url):
        """Test logout endpoint"""
        response = api_client.post(f"{base_url}/api/auth/logout")
        print(f"Logout response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Logout successful")
