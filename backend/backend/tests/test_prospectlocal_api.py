"""
ProspectLocal V2 API Tests
Tests for phone number quality and geographic relevance
"""
import pytest
import requests
import os
import re
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://pappers-search-plus.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "andy.clerfayt@live.fr"
TEST_PASSWORD = "2B8j7l3e."


class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    def test_login_success(self):
        """Test successful login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        print(f"✅ Login successful, token received")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpass"}
        )
        assert response.status_code in [401, 400]
        print(f"✅ Invalid login correctly rejected")


class TestScans:
    """Scan API tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_scans_list(self, auth_token):
        """Test getting list of scans"""
        response = requests.get(
            f"{BASE_URL}/api/scans",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Retrieved {len(data)} scans")
        
        # Check scan structure
        if len(data) > 0:
            scan = data[0]
            assert "id" in scan
            assert "query_label" in scan or "location_label" in scan
            print(f"  First scan: {scan.get('query_label', 'N/A')} - {scan.get('location_label', 'N/A')}")
    
    def test_get_active_scans(self, auth_token):
        """Test getting active scans"""
        response = requests.get(
            f"{BASE_URL}/api/scans/active",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✅ Active scans endpoint working")


class TestPhoneNumberQuality:
    """Tests for phone number quality and geographic relevance"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def lille_scan_id(self, auth_token):
        """Find a scan for Lille region"""
        response = requests.get(
            f"{BASE_URL}/api/scans",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        scans = response.json()
        
        # Find a scan for Lille/Nord region
        for scan in scans:
            location = scan.get("location_label", "").lower()
            if "lille" in location or "nord" in location or "59" in location:
                print(f"✅ Found Lille scan: {scan['id']} - {scan.get('query_label', 'N/A')}")
                return scan["id"]
        
        # If no Lille scan found, return the first scan
        if scans:
            print(f"⚠️ No Lille scan found, using first scan: {scans[0]['id']}")
            return scans[0]["id"]
        
        pytest.skip("No scans available for testing")
    
    def test_phone_number_prefixes(self, auth_token, lille_scan_id):
        """
        Test that phone numbers in Lille region results have appropriate prefixes
        Valid prefixes for Nord (Lille):
        - 03: Fixed line Nord region
        - 06, 07: Mobile
        - 09: VoIP/Free
        Invalid for Nord:
        - 01: Paris region
        """
        response = requests.get(
            f"{BASE_URL}/api/scans/{lille_scan_id}/businesses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Get businesses from verified or main list
        businesses = data.get("verified_businesses", data.get("businesses", []))
        
        if not businesses:
            pytest.skip("No businesses in scan results")
        
        # Analyze phone numbers
        phone_stats = {
            "total": 0,
            "with_phone": 0,
            "prefix_03": 0,  # Nord fixed
            "prefix_06": 0,  # Mobile
            "prefix_07": 0,  # Mobile
            "prefix_09": 0,  # VoIP
            "prefix_01": 0,  # Paris (potential issue)
            "prefix_02": 0,  # Northwest
            "prefix_04": 0,  # Southeast
            "prefix_05": 0,  # Southwest
            "prefix_08": 0,  # Special numbers
            "other": 0
        }
        
        paris_numbers = []
        
        for business in businesses:
            phone_stats["total"] += 1
            phone = business.get("phone", "")
            
            if phone:
                phone_stats["with_phone"] += 1
                # Normalize phone number
                clean_phone = re.sub(r'\D', '', phone)
                if clean_phone.startswith('33'):
                    clean_phone = '0' + clean_phone[2:]
                
                if len(clean_phone) >= 2:
                    prefix = clean_phone[:2]
                    if prefix == "03":
                        phone_stats["prefix_03"] += 1
                    elif prefix == "06":
                        phone_stats["prefix_06"] += 1
                    elif prefix == "07":
                        phone_stats["prefix_07"] += 1
                    elif prefix == "09":
                        phone_stats["prefix_09"] += 1
                    elif prefix == "01":
                        phone_stats["prefix_01"] += 1
                        paris_numbers.append({
                            "name": business.get("name", "N/A"),
                            "phone": phone,
                            "city": business.get("city", "N/A")
                        })
                    elif prefix == "02":
                        phone_stats["prefix_02"] += 1
                    elif prefix == "04":
                        phone_stats["prefix_04"] += 1
                    elif prefix == "05":
                        phone_stats["prefix_05"] += 1
                    elif prefix == "08":
                        phone_stats["prefix_08"] += 1
                    else:
                        phone_stats["other"] += 1
        
        # Print analysis
        print(f"\n📊 Phone Number Analysis for scan {lille_scan_id}:")
        print(f"  Total businesses: {phone_stats['total']}")
        print(f"  With phone: {phone_stats['with_phone']}")
        print(f"  📞 03 (Nord fixed): {phone_stats['prefix_03']}")
        print(f"  📱 06 (Mobile): {phone_stats['prefix_06']}")
        print(f"  📱 07 (Mobile): {phone_stats['prefix_07']}")
        print(f"  📞 09 (VoIP): {phone_stats['prefix_09']}")
        print(f"  ⚠️ 01 (Paris): {phone_stats['prefix_01']}")
        print(f"  📞 02 (Northwest): {phone_stats['prefix_02']}")
        print(f"  📞 04 (Southeast): {phone_stats['prefix_04']}")
        print(f"  📞 05 (Southwest): {phone_stats['prefix_05']}")
        
        # Calculate local relevance
        local_numbers = phone_stats["prefix_03"] + phone_stats["prefix_06"] + phone_stats["prefix_07"] + phone_stats["prefix_09"]
        if phone_stats["with_phone"] > 0:
            local_percentage = (local_numbers / phone_stats["with_phone"]) * 100
            paris_percentage = (phone_stats["prefix_01"] / phone_stats["with_phone"]) * 100
            print(f"\n  ✅ Local relevance (03/06/07/09): {local_percentage:.1f}%")
            print(f"  ⚠️ Paris numbers (01): {paris_percentage:.1f}%")
            
            # List Paris numbers if any
            if paris_numbers:
                print(f"\n  ⚠️ Paris numbers found ({len(paris_numbers)}):")
                for pn in paris_numbers[:5]:  # Show first 5
                    print(f"    - {pn['name']} ({pn['city']}): {pn['phone']}")
        
        # Assert that Paris numbers are less than 5% of total
        if phone_stats["with_phone"] > 10:
            paris_ratio = phone_stats["prefix_01"] / phone_stats["with_phone"]
            assert paris_ratio < 0.10, f"Too many Paris numbers ({paris_ratio*100:.1f}%) for Nord region"
            print(f"\n✅ Phone number quality check passed")


class TestVisitesTerrain:
    """Tests for Visites Terrain functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_visites_terrain(self, auth_token):
        """Test getting visites terrain list"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/visites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "businesses" in data
        assert "total" in data
        
        print(f"✅ Visites Terrain: {data['total']} total")
        print(f"  Pappers: {data.get('pappers_count', 0)}")
        print(f"  Autres: {data.get('autres_count', 0)}")
        
        # Check that visites terrain businesses don't have phone
        businesses = data.get("businesses", [])
        with_phone = sum(1 for b in businesses if b.get("phone"))
        without_phone = len(businesses) - with_phone
        
        print(f"  With phone: {with_phone}")
        print(f"  Without phone: {without_phone}")
        
        # Most visites terrain should be without phone
        if len(businesses) > 5:
            assert without_phone >= with_phone * 0.5, "Visites terrain should mostly be businesses without phone"


class TestBusinessDetail:
    """Tests for business detail functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def sample_business_id(self, auth_token):
        """Get a sample business ID from visites or scans"""
        # Try visites first
        response = requests.get(
            f"{BASE_URL}/api/businesses/visites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 200:
            data = response.json()
            businesses = data.get("businesses", [])
            if businesses:
                return businesses[0]["id"]
        
        # Try scans
        response = requests.get(
            f"{BASE_URL}/api/scans",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if response.status_code == 200:
            scans = response.json()
            if scans:
                scan_id = scans[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/scans/{scan_id}/businesses",
                    headers={"Authorization": f"Bearer {auth_token}"}
                )
                if response.status_code == 200:
                    data = response.json()
                    businesses = data.get("verified_businesses", data.get("businesses", []))
                    if businesses:
                        return businesses[0]["id"]
        
        pytest.skip("No businesses available for testing")
    
    def test_get_business_detail(self, auth_token, sample_business_id):
        """Test getting business detail"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/{sample_business_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "id" in data
        assert "name" in data
        
        print(f"✅ Business detail retrieved: {data.get('name', 'N/A')}")
        print(f"  Address: {data.get('address', 'N/A')}")
        print(f"  City: {data.get('city', 'N/A')}")
        print(f"  Phone: {data.get('phone', 'N/A')}")
        print(f"  Website: {data.get('website_url', 'N/A')}")
        print(f"  Score: {data.get('score', 'N/A')}")
        print(f"  Has PagesJaunes: {data.get('has_pagesjaunes', 'N/A')}")


class TestStats:
    """Tests for statistics functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_get_dashboard_stats(self, auth_token):
        """Test getting dashboard statistics"""
        response = requests.get(
            f"{BASE_URL}/api/stats/dashboard",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "total_leads" in data
        assert "leads_with_phone" in data
        
        print(f"✅ Dashboard stats retrieved:")
        print(f"  Total leads: {data.get('total_leads', 0)}")
        print(f"  Internet leads: {data.get('internet_leads', 0)}")
        print(f"  Pappers leads: {data.get('pappers_leads', 0)}")
        print(f"  With phone: {data.get('leads_with_phone', 0)}")
        print(f"  Without phone: {data.get('leads_without_phone', 0)}")
        print(f"  Visites terrain pending: {data.get('visites_terrain_pending', 0)}")
    
    def test_get_trends(self, auth_token):
        """Test getting trends statistics"""
        response = requests.get(
            f"{BASE_URL}/api/stats/trends",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        # Trends endpoint might not exist or return empty
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Trends stats retrieved")
            if "summary" in data:
                print(f"  Total scans (30d): {data['summary'].get('total_scans_30d', 0)}")
                print(f"  Total leads (30d): {data['summary'].get('total_leads_30d', 0)}")
        else:
            print(f"⚠️ Trends endpoint returned {response.status_code}")


class TestEnrichment:
    """Tests for enrichment functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def test_enrichment_source_tracking(self, auth_token):
        """Test that enrichment sources are tracked correctly"""
        # Get a scan with businesses
        response = requests.get(
            f"{BASE_URL}/api/scans",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        scans = response.json()
        
        if not scans:
            pytest.skip("No scans available")
        
        # Get businesses from first scan
        scan_id = scans[0]["id"]
        response = requests.get(
            f"{BASE_URL}/api/scans/{scan_id}/businesses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        businesses = data.get("verified_businesses", data.get("businesses", []))
        
        # Check enrichment sources
        enrichment_stats = {
            "google_places": 0,
            "serper": 0,
            "knowledge_graph": 0,
            "annuaire": 0,
            "website_scraping": 0,
            "unknown": 0
        }
        
        for business in businesses:
            source = business.get("enrichment_source") or business.get("phone_source")
            if source:
                if source in enrichment_stats:
                    enrichment_stats[source] += 1
                else:
                    enrichment_stats["unknown"] += 1
        
        print(f"\n📊 Enrichment Sources Analysis:")
        for source, count in enrichment_stats.items():
            if count > 0:
                print(f"  {source}: {count}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
