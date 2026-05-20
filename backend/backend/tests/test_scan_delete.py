"""
Test suite for Scan Delete functionality
Tests the DELETE /api/scans/{scan_id} endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://pappers-search-plus.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "andyclerfayt59160@gmail.com"
TEST_PASSWORD = "2B8j7l3e."


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestScanDeleteAPI:
    """Tests for DELETE /api/scans/{scan_id} endpoint"""
    
    def test_get_scans_list(self, auth_headers):
        """Test that we can get the list of scans"""
        response = requests.get(f"{BASE_URL}/api/scans", headers=auth_headers)
        assert response.status_code == 200
        
        scans = response.json()
        assert isinstance(scans, list)
        print(f"Found {len(scans)} scans")
        
        # Store scan count for later tests
        return len(scans)
    
    def test_delete_scan_success(self, auth_headers):
        """Test successful scan deletion"""
        # First, get the list of scans
        response = requests.get(f"{BASE_URL}/api/scans", headers=auth_headers)
        assert response.status_code == 200
        
        scans = response.json()
        initial_count = len(scans)
        
        if initial_count == 0:
            pytest.skip("No scans available to delete")
        
        # Get the first scan ID
        scan_id = scans[0]["id"]
        scan_name = scans[0].get("query_label", "Unknown")
        print(f"Deleting scan: {scan_name} (ID: {scan_id})")
        
        # Delete the scan
        delete_response = requests.delete(
            f"{BASE_URL}/api/scans/{scan_id}",
            headers=auth_headers
        )
        
        # Verify deletion was successful
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        result = delete_response.json()
        assert result.get("success") == True
        assert "deleted" in result.get("message", "").lower()
        
        print(f"Scan deleted successfully: {result}")
        
        # Verify scan is no longer in the list
        verify_response = requests.get(f"{BASE_URL}/api/scans", headers=auth_headers)
        assert verify_response.status_code == 200
        
        new_scans = verify_response.json()
        new_count = len(new_scans)
        
        assert new_count == initial_count - 1, f"Scan count should decrease by 1 (was {initial_count}, now {new_count})"
        
        # Verify the deleted scan is not in the list
        scan_ids = [s["id"] for s in new_scans]
        assert scan_id not in scan_ids, "Deleted scan should not be in the list"
        
        print(f"Verified: Scan count decreased from {initial_count} to {new_count}")
    
    def test_delete_nonexistent_scan(self, auth_headers):
        """Test deleting a scan that doesn't exist"""
        fake_scan_id = "nonexistent-scan-id-12345"
        
        response = requests.delete(
            f"{BASE_URL}/api/scans/{fake_scan_id}",
            headers=auth_headers
        )
        
        # Should return 404 for non-existent scan
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"Correctly returned 404 for non-existent scan")
    
    def test_delete_scan_unauthorized(self):
        """Test deleting a scan without authentication"""
        fake_scan_id = "some-scan-id"
        
        response = requests.delete(f"{BASE_URL}/api/scans/{fake_scan_id}")
        
        # Should return 401 or 403 for unauthorized request
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"Correctly returned {response.status_code} for unauthorized request")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
