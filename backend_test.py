#!/usr/bin/env python3
"""
Backend API Tests for Business Prospection Application
Tests all backend endpoints comprehensively
"""

import requests
import json
import time
import sys
from typing import Dict, Any

# Backend URL from frontend .env
BASE_URL = "https://leadgenie-18.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'Backend-Tester/1.0'
        })
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        
        self.test_results.append({
            'test': test_name,
            'success': success,
            'details': details
        })
    
    def test_api_root(self) -> bool:
        """Test GET /api/ - Root endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                if "message" in data and "endpoints" in data:
                    endpoints = data["endpoints"]
                    required_endpoints = ["search", "businesses", "export"]
                    
                    missing = [ep for ep in required_endpoints if ep not in endpoints]
                    if missing:
                        self.log_test("API Root", False, f"Missing endpoints: {missing}")
                        return False
                    
                    self.log_test("API Root", True, f"Message: {data['message']}")
                    return True
                else:
                    self.log_test("API Root", False, "Missing required fields in response")
                    return False
            else:
                self.log_test("API Root", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("API Root", False, f"Exception: {str(e)}")
            return False
    
    def test_search_businesses(self) -> bool:
        """Test POST /api/search - Business search"""
        try:
            # Test data with realistic French business search
            test_data = {
                "query": "plombier",
                "location": "Lille",
                "radius": 10000
            }
            
            response = self.session.post(f"{BASE_URL}/search", json=test_data)
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                required_fields = ["success", "count", "businesses"]
                missing = [field for field in required_fields if field not in data]
                if missing:
                    self.log_test("Search Businesses", False, f"Missing fields: {missing}")
                    return False
                
                if not data["success"]:
                    self.log_test("Search Businesses", False, "API returned success: false")
                    return False
                
                businesses = data["businesses"]
                if not isinstance(businesses, list):
                    self.log_test("Search Businesses", False, "Businesses is not a list")
                    return False
                
                if len(businesses) == 0:
                    self.log_test("Search Businesses", True, "No businesses found (expected with demo data)")
                    return True
                
                # Check first business structure
                business = businesses[0]
                required_business_fields = ["id", "name", "has_pages_jaunes"]
                missing_business = [field for field in required_business_fields if field not in business]
                if missing_business:
                    self.log_test("Search Businesses", False, f"Business missing fields: {missing_business}")
                    return False
                
                # Verify has_pages_jaunes is boolean
                if not isinstance(business["has_pages_jaunes"], bool):
                    self.log_test("Search Businesses", False, "has_pages_jaunes is not boolean")
                    return False
                
                self.log_test("Search Businesses", True, f"Found {data['count']} businesses")
                return True
                
            else:
                self.log_test("Search Businesses", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Search Businesses", False, f"Exception: {str(e)}")
            return False
    
    def test_get_businesses(self) -> bool:
        """Test GET /api/businesses - Retrieve saved businesses"""
        try:
            response = self.session.get(f"{BASE_URL}/businesses")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                required_fields = ["success", "total", "count", "businesses"]
                missing = [field for field in required_fields if field not in data]
                if missing:
                    self.log_test("Get Businesses", False, f"Missing fields: {missing}")
                    return False
                
                if not data["success"]:
                    self.log_test("Get Businesses", False, "API returned success: false")
                    return False
                
                # Test pagination parameters
                response_paginated = self.session.get(f"{BASE_URL}/businesses?skip=0&limit=5")
                if response_paginated.status_code != 200:
                    self.log_test("Get Businesses", False, "Pagination parameters failed")
                    return False
                
                self.log_test("Get Businesses", True, f"Retrieved {data['count']} businesses (total: {data['total']})")
                return True
                
            else:
                self.log_test("Get Businesses", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Businesses", False, f"Exception: {str(e)}")
            return False
    
    def test_export_csv(self) -> bool:
        """Test POST /api/export/csv - CSV export"""
        try:
            response = self.session.post(f"{BASE_URL}/export/csv")
            
            if response.status_code == 200:
                # Check content type
                content_type = response.headers.get('content-type', '')
                if 'text/csv' not in content_type:
                    self.log_test("Export CSV", False, f"Wrong content type: {content_type}")
                    return False
                
                # Check content disposition header
                disposition = response.headers.get('content-disposition', '')
                if 'attachment' not in disposition or '.csv' not in disposition:
                    self.log_test("Export CSV", False, f"Wrong content disposition: {disposition}")
                    return False
                
                # Check CSV content
                content = response.text
                if not content or len(content) < 10:
                    self.log_test("Export CSV", False, "CSV content too short or empty")
                    return False
                
                # Check CSV headers
                lines = content.split('\n')
                if len(lines) < 1:
                    self.log_test("Export CSV", False, "No CSV headers found")
                    return False
                
                headers = lines[0].split(',')
                required_headers = ["Nom", "Adresse", "Téléphone", "Pages Jaunes"]
                missing_headers = [h for h in required_headers if not any(h in header for header in headers)]
                if missing_headers:
                    self.log_test("Export CSV", False, f"Missing CSV headers: {missing_headers}")
                    return False
                
                self.log_test("Export CSV", True, f"CSV exported successfully ({len(content)} bytes)")
                return True
                
            elif response.status_code == 404:
                self.log_test("Export CSV", True, "No data to export (expected)")
                return True
            else:
                self.log_test("Export CSV", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Export CSV", False, f"Exception: {str(e)}")
            return False
    
    def test_export_excel(self) -> bool:
        """Test POST /api/export/excel - Excel export"""
        try:
            response = self.session.post(f"{BASE_URL}/export/excel")
            
            if response.status_code == 200:
                # Check content type
                content_type = response.headers.get('content-type', '')
                expected_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                if expected_type not in content_type:
                    self.log_test("Export Excel", False, f"Wrong content type: {content_type}")
                    return False
                
                # Check content disposition header
                disposition = response.headers.get('content-disposition', '')
                if 'attachment' not in disposition or '.xlsx' not in disposition:
                    self.log_test("Export Excel", False, f"Wrong content disposition: {disposition}")
                    return False
                
                # Check Excel content (binary)
                content = response.content
                if not content or len(content) < 100:
                    self.log_test("Export Excel", False, "Excel content too short or empty")
                    return False
                
                # Check Excel magic bytes
                if not content.startswith(b'PK'):
                    self.log_test("Export Excel", False, "Invalid Excel file format")
                    return False
                
                self.log_test("Export Excel", True, f"Excel exported successfully ({len(content)} bytes)")
                return True
                
            elif response.status_code == 404:
                self.log_test("Export Excel", True, "No data to export (expected)")
                return True
            else:
                self.log_test("Export Excel", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Export Excel", False, f"Exception: {str(e)}")
            return False
    
    def test_export_json(self) -> bool:
        """Test POST /api/export/json - JSON export"""
        try:
            response = self.session.post(f"{BASE_URL}/export/json")
            
            if response.status_code == 200:
                # Check content type
                content_type = response.headers.get('content-type', '')
                if 'application/json' not in content_type:
                    self.log_test("Export JSON", False, f"Wrong content type: {content_type}")
                    return False
                
                # Check content disposition header
                disposition = response.headers.get('content-disposition', '')
                if 'attachment' not in disposition or '.json' not in disposition:
                    self.log_test("Export JSON", False, f"Wrong content disposition: {disposition}")
                    return False
                
                # Check JSON content
                content = response.text
                if not content or len(content) < 10:
                    self.log_test("Export JSON", False, "JSON content too short or empty")
                    return False
                
                # Validate JSON format
                try:
                    data = json.loads(content)
                    if not isinstance(data, list):
                        self.log_test("Export JSON", False, "JSON data is not a list")
                        return False
                except json.JSONDecodeError as e:
                    self.log_test("Export JSON", False, f"Invalid JSON format: {str(e)}")
                    return False
                
                self.log_test("Export JSON", True, f"JSON exported successfully ({len(content)} bytes)")
                return True
                
            elif response.status_code == 404:
                self.log_test("Export JSON", True, "No data to export (expected)")
                return True
            else:
                self.log_test("Export JSON", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Export JSON", False, f"Exception: {str(e)}")
            return False
    
    def test_delete_businesses(self) -> bool:
        """Test DELETE /api/businesses - Clear all businesses"""
        try:
            response = self.session.delete(f"{BASE_URL}/businesses")
            
            if response.status_code == 200:
                data = response.json()
                
                # Check response structure
                required_fields = ["success", "deleted_count"]
                missing = [field for field in required_fields if field not in data]
                if missing:
                    self.log_test("Delete Businesses", False, f"Missing fields: {missing}")
                    return False
                
                if not data["success"]:
                    self.log_test("Delete Businesses", False, "API returned success: false")
                    return False
                
                deleted_count = data["deleted_count"]
                self.log_test("Delete Businesses", True, f"Deleted {deleted_count} businesses")
                return True
                
            else:
                self.log_test("Delete Businesses", False, f"HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Delete Businesses", False, f"Exception: {str(e)}")
            return False
    
    def test_mongodb_storage(self) -> bool:
        """Test MongoDB storage by doing search -> get -> verify data persistence"""
        try:
            # First, clear existing data
            self.session.delete(f"{BASE_URL}/businesses")
            
            # Do a search to create data
            search_data = {
                "query": "électricien",
                "location": "Paris",
                "radius": 5000
            }
            
            search_response = self.session.post(f"{BASE_URL}/search", json=search_data)
            if search_response.status_code != 200:
                self.log_test("MongoDB Storage", False, "Search failed during storage test")
                return False
            
            search_result = search_response.json()
            if not search_result["success"] or search_result["count"] == 0:
                self.log_test("MongoDB Storage", True, "No data created (demo mode)")
                return True
            
            # Wait a moment for data to be saved
            time.sleep(1)
            
            # Retrieve data to verify storage
            get_response = self.session.get(f"{BASE_URL}/businesses")
            if get_response.status_code != 200:
                self.log_test("MongoDB Storage", False, "Failed to retrieve stored data")
                return False
            
            get_result = get_response.json()
            if not get_result["success"]:
                self.log_test("MongoDB Storage", False, "Get businesses returned success: false")
                return False
            
            # Verify data matches
            stored_count = get_result["count"]
            search_count = search_result["count"]
            
            if stored_count != search_count:
                self.log_test("MongoDB Storage", False, f"Data mismatch: searched {search_count}, stored {stored_count}")
                return False
            
            # Verify business structure in storage
            if stored_count > 0:
                # MongoDB returns in reverse chronological order, so compare by finding matching businesses
                stored_businesses = get_result["businesses"]
                search_businesses = search_result["businesses"]
                
                # Create a set of search business names for comparison
                search_names = {b["name"] for b in search_businesses}
                stored_names = {b["name"] for b in stored_businesses}
                
                # Check that all searched businesses are stored
                if not search_names.issubset(stored_names):
                    missing = search_names - stored_names
                    self.log_test("MongoDB Storage", False, f"Missing businesses in storage: {missing}")
                    return False
                
                # Verify structure by checking first stored business has required fields
                stored_business = stored_businesses[0]
                required_fields = ["name", "has_pages_jaunes", "search_query", "id", "created_at"]
                missing_fields = [field for field in required_fields if field not in stored_business]
                if missing_fields:
                    self.log_test("MongoDB Storage", False, f"Missing fields in stored business: {missing_fields}")
                    return False
            
            self.log_test("MongoDB Storage", True, f"Data persistence verified ({stored_count} businesses)")
            return True
            
        except Exception as e:
            self.log_test("MongoDB Storage", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests")
        print(f"📍 Testing against: {BASE_URL}")
        print("=" * 60)
        
        tests = [
            ("API Root", self.test_api_root),
            ("Search Businesses", self.test_search_businesses),
            ("Get Businesses", self.test_get_businesses),
            ("Export CSV", self.test_export_csv),
            ("Export Excel", self.test_export_excel),
            ("Export JSON", self.test_export_json),
            ("Delete Businesses", self.test_delete_businesses),
            ("MongoDB Storage", self.test_mongodb_storage),
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n🧪 Running: {test_name}")
            try:
                if test_func():
                    passed += 1
            except Exception as e:
                self.log_test(test_name, False, f"Unexpected error: {str(e)}")
        
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests PASSED!")
            return True
        else:
            print("❌ Some tests FAILED!")
            print("\nFailed tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
            return False

def main():
    """Main test runner"""
    tester = BackendTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()