import pytest
import requests
import time

class TestAIAnalysis:
    """AI analysis endpoint tests"""

    def test_analyze_contact_with_signals(self, api_client, base_url, admin_token):
        """Test AI analysis of contact with signals"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # Create a contact
        contact_data = {
            "name": "TEST_AI Analysis Contact",
            "role": "Real Estate Agent",
            "company": "Property Co",
            "location": "Auckland, NZ"
        }
        
        create_response = api_client.post(
            f"{base_url}/api/contacts",
            json=contact_data,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert create_response.status_code == 200
        contact_id = create_response.json()["id"]
        
        # Add signals
        signals = [
            {
                "signal_type": "property_activity",
                "title": "Property Listed",
                "description": "Client listing property at $1.5M",
                "is_auto": True
            },
            {
                "signal_type": "meeting_recorded",
                "title": "Meeting Scheduled",
                "description": "Property inspection scheduled",
                "is_auto": True
            }
        ]
        
        for signal in signals:
            signal_response = api_client.post(
                f"{base_url}/api/contacts/{contact_id}/signals",
                json=signal,
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert signal_response.status_code == 200
        
        print(f"Created {len(signals)} signals for contact")
        
        # Analyze contact
        response = api_client.post(
            f"{base_url}/api/contacts/{contact_id}/analyze",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Analyze contact response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data, "status not in response"
        assert "opportunities" in data, "opportunities not in response"
        assert data["status"] == "ready", "Status should be ready"
        assert isinstance(data["opportunities"], list), "Opportunities should be a list"
        print(f"✓ Analysis complete: {len(data['opportunities'])} opportunities detected")
        
        # Verify opportunities structure
        if len(data["opportunities"]) > 0:
            opp = data["opportunities"][0]
            assert "title" in opp, "Opportunity should have title"
            assert "match_percentage" in opp, "Opportunity should have match_percentage"
            print(f"✓ Opportunity structure valid: {opp.get('title', 'N/A')}")

    def test_analyze_contact_no_signals(self, api_client, base_url, admin_token):
        """Test AI analysis of contact without signals"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # Create a contact
        contact_data = {
            "name": "TEST_No Signals Contact",
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
        
        # Analyze contact (no signals)
        response = api_client.post(
            f"{base_url}/api/contacts/{contact_id}/analyze",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Analyze contact (no signals) response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "ready", "Status should be ready"
        assert len(data["opportunities"]) == 0, "Should have no opportunities without signals"
        print("✓ Analysis with no signals returns empty opportunities")

    def test_get_opportunities(self, api_client, base_url, admin_token):
        """Test getting opportunities for a contact"""
        if not admin_token:
            pytest.skip("Admin token not available")
        
        # Create a contact
        contact_data = {
            "name": "TEST_Opportunities Contact",
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
        
        # Get opportunities (should be empty initially)
        response = api_client.get(
            f"{base_url}/api/contacts/{contact_id}/opportunities",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        print(f"Get opportunities response status: {response.status_code}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Opportunities retrieved: {len(data)} opportunities")
