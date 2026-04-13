import pytest
import requests

class TestSeedData:
    """Seed data endpoint tests"""

    def test_seed_demo_data(self, api_client, base_url, admin_token):
        """Test seeding demo data"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        response = api_client.post(
            f"{base_url}/api/seed",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Seed demo data response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "message not in response"
        print(f"✓ Seed response: {data['message']}")
        
        # Verify contacts were created
        contacts_response = api_client.get(
            f"{base_url}/api/contacts",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert contacts_response.status_code == 200
        contacts = contacts_response.json()
        print(f"✓ Contacts after seeding: {len(contacts)} contacts")
