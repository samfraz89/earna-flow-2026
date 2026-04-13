import pytest
import requests

class TestContacts:
    """Contacts CRUD tests"""

    def test_get_contacts_empty(self, api_client, base_url, admin_token):
        """Test getting contacts list (may be empty initially)"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        response = api_client.get(
            f"{base_url}/api/contacts",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get contacts response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Contacts retrieved: {len(data)} contacts")

    def test_create_contact(self, api_client, base_url, admin_token):
        """Test creating a new contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        contact_data = {
            "name": "TEST_John Doe",
            "role": "Software Engineer",
            "company": "Tech Corp",
            "location": "Auckland, NZ",
            "email": "john@techcorp.com",
            "phone": "+64 21 123 4567",
            "avatar_emoji": "👨"
        }
        
        response = api_client.post(
            f"{base_url}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create contact response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "id not in response"
        assert data["name"] == contact_data["name"], "Name mismatch"
        assert data["role"] == contact_data["role"], "Role mismatch"
        print(f"✓ Contact created with ID: {data['id']}")
        
        # Verify persistence by getting the contact
        contact_id = data["id"]
        get_response = api_client.get(
            f"{base_url}/api/contacts/{contact_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 200, "Contact not persisted"
        get_data = get_response.json()
        assert get_data["name"] == contact_data["name"], "Persisted data mismatch"
        print("✓ Contact persistence verified")

    def test_get_contact_by_id(self, api_client, base_url, admin_token):
        """Test getting a specific contact by ID"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # First create a contact
        contact_data = {
            "name": "TEST_Jane Smith",
            "role": "Product Manager",
            "company": "Startup Inc",
            "location": "Wellington, NZ"
        }
        
        create_response = api_client.post(
            f"{base_url}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert create_response.status_code == 200
        contact_id = create_response.json()["id"]
        
        # Get the contact
        response = api_client.get(
            f"{base_url}/api/contacts/{contact_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get contact by ID response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["id"] == contact_id, "ID mismatch"
        assert data["name"] == contact_data["name"], "Name mismatch"
        print(f"✓ Contact retrieved by ID: {contact_id}")

    def test_get_contact_not_found(self, api_client, base_url, admin_token):
        """Test getting a non-existent contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        response = api_client.get(
            f"{base_url}/api/contacts/nonexistent-id-12345",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get non-existent contact response status: {response.status_code}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent contact returns 404")
