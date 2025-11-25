from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch, MagicMock
import httpx

client = TestClient(app)

def test_extract_og_tags_success():
    mock_html = """
    <html>
        <head>
            <meta property="og:title" content="Test Title" />
            <meta property="og:description" content="Test Description" />
            <meta property="og:image" content="http://example.com/image.jpg" />
        </head>
        <body></body>
    </html>
    """
    
    with patch('httpx.AsyncClient') as MockClient:
        mock_client_instance = MagicMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = mock_html
        mock_response.raise_for_status = MagicMock()
        
        async def async_return():
            return mock_response
        mock_client_instance.get.return_value = async_return()
        
        response = client.post("/extract", json={"url": "http://example.com"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["og:title"] == "Test Title"
        assert data["og:description"] == "Test Description"
        assert data["og:image"] == "http://example.com/image.jpg"

def test_extract_og_tags_invalid_url_format():
    response = client.post("/extract", json={"url": "not-a-url"})
    assert response.status_code == 422

def test_extract_og_tags_request_error():
    with patch('httpx.AsyncClient') as MockClient:
        mock_client_instance = MagicMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        
    with patch('httpx.AsyncClient') as MockClient:
        mock_client_instance = MagicMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        
        async def async_raise(*args, **kwargs):
            # Use a concrete exception class
            raise httpx.ConnectError("Connection failed", request=MagicMock())
        mock_client_instance.get.side_effect = async_raise
        
        response = client.post("/extract", json={"url": "http://example.com"})
        
        # Debugging: print response if status code is not 400
        if response.status_code != 400:
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.json()}")
            
        assert response.status_code == 400
        assert "Error fetching URL" in response.json()["detail"]

def test_extract_og_tags_http_error():
    with patch('httpx.AsyncClient') as MockClient:
        mock_client_instance = MagicMock()
        MockClient.return_value.__aenter__.return_value = mock_client_instance
        
        mock_response = MagicMock()
        mock_response.status_code = 404
        
        # raise_for_status should raise HTTPStatusError
        def raise_for_status():
            raise httpx.HTTPStatusError("Not Found", request=MagicMock(), response=mock_response)
        
        mock_response.raise_for_status.side_effect = raise_for_status
        
        async def async_return():
            return mock_response
        mock_client_instance.get.return_value = async_return()
        
        response = client.post("/extract", json={"url": "http://example.com/404"})
        
        assert response.status_code == 404
        assert "HTTP error" in response.json()["detail"]
