import pytest
import requests

class TestSignals:
    """Signals CRUD tests"""

    def test_get_signals_for_contact(self, api_client, base_url, admin_token):
        """Test getting signals for a contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # First create a contact
        contact_data = {
            "name": "TEST_Signal Contact",
            "role": "Test Role",
            "company": "Test Company",
            "location": "Test Location"
        }
        
        create_response = api_client.post(
            f"{base_url}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert create_response.status_code == 200
        contact_id = create_response.json()["id"]
        
        # Get signals (should be empty initially)
        response = api_client.get(
            f"{base_url}/api/contacts/{contact_id}/signals",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get signals response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Signals retrieved: {len(data)} signals")

    def test_create_signal(self, api_client, base_url, admin_token):
        """Test creating a signal for a contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # First create a contact
        contact_data = {
            "name": "TEST_Signal Contact 2",
            "role": "Test Role",
            "company": "Test Company",
            "location": "Test Location"
        }
        
        create_response = api_client.post(
            f"{base_url}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert create_response.status_code == 200
        contact_id = create_response.json()["id"]
        
        # Create a signal
        signal_data = {
            "signal_type": "meeting_recorded",
            "title": "Test Meeting",
            "description": "Test meeting signal",
            "is_auto": False
        }
        
        response = api_client.post(
            f"{base_url}/api/contacts/{contact_id}/signals",
            json=signal_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create signal response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "id not in response"
        assert data["title"] == signal_data["title"], "Title mismatch"
        assert data["signal_type"] == signal_data["signal_type"], "Signal type mismatch"
        print(f"✓ Signal created with ID: {data['id']}")
        
        # Verify persistence
        get_response = api_client.get(
            f"{base_url}/api/contacts/{contact_id}/signals",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 200
        signals = get_response.json()
        assert len(signals) > 0, "Signal not persisted"
        assert signals[0]["title"] == signal_data["title"], "Persisted signal mismatch"
        print("✓ Signal persistence verified")

    def test_create_signal_for_nonexistent_contact(self, api_client, base_url, admin_token):
        """Test creating a signal for a non-existent contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        signal_data = {
            "signal_type": "meeting_recorded",
            "title": "Test Meeting",
            "description": "Test meeting signal",
            "is_auto": False
        }
        
        response = api_client.post(
            f"{base_url}/api/contacts/nonexistent-id/signals",
            json=signal_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Create signal for non-existent contact response status: {response.status_code}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Signal creation for non-existent contact returns 404")
