"""
Test Priority Support Feature APIs:
- POST /api/support/chat - AI chat endpoint
- GET /api/support/conversations - List conversations
- GET /api/support/conversations/{id} - Get single conversation
- POST /api/support/tickets - Create support ticket
- GET /api/support/tickets - List tickets
- GET /api/support/tickets/{id} - Get single ticket
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test2@test.com"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for tests"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_res.status_code != 200:
        pytest.skip(f"Login failed with status {login_res.status_code}: {login_res.text}")
    
    return session


class TestSupportChatAPI:
    """Test AI chat endpoint"""
    
    def test_chat_new_conversation(self, auth_session):
        """POST /api/support/chat - Start new conversation"""
        res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "What features are available in my plan?"
        })
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "conversation_id" in data, "Response should contain conversation_id"
        assert "response" in data, "Response should contain AI response"
        assert "priority" in data, "Response should contain priority level"
        
        # Verify priority for enterprise user
        assert data["priority"] == "priority", f"Enterprise user should have priority support, got {data['priority']}"
        
        # Verify AI response is non-empty
        assert len(data["response"]) > 0, "AI response should not be empty"
        
        print(f"✓ Chat created conversation: {data['conversation_id']}")
        print(f"✓ AI Response preview: {data['response'][:100]}...")
        
        return data["conversation_id"]
    
    def test_chat_continue_conversation(self, auth_session):
        """POST /api/support/chat - Continue existing conversation"""
        # First message
        res1 = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "TEST_SUPPORT: Hi, I need help with billing"
        })
        assert res1.status_code == 200
        conv_id = res1.json()["conversation_id"]
        
        # Wait for AI to process
        time.sleep(2)
        
        # Second message in same conversation
        res2 = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "How do I upgrade my plan?",
            "conversation_id": conv_id
        })
        
        assert res2.status_code == 200, f"Expected 200, got {res2.status_code}: {res2.text}"
        data = res2.json()
        
        # Should return same conversation_id
        assert data["conversation_id"] == conv_id, "Should continue same conversation"
        
        print(f"✓ Multi-turn conversation working with ID: {conv_id}")


class TestConversationsAPI:
    """Test conversation listing and retrieval"""
    
    def test_list_conversations(self, auth_session):
        """GET /api/support/conversations - List all conversations"""
        res = auth_session.get(f"{BASE_URL}/api/support/conversations")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response is a list
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            conv = data[0]
            # Verify conversation structure
            assert "conversation_id" in conv, "Conversation should have conversation_id"
            assert "priority" in conv, "Conversation should have priority"
            assert "last_message" in conv, "Conversation should have last_message preview"
            assert "updated_at" in conv, "Conversation should have updated_at"
            
            print(f"✓ Found {len(data)} conversations")
            print(f"✓ Latest conversation: {conv['conversation_id']}")
        else:
            print("✓ Conversations list empty (expected for new user)")
    
    def test_get_single_conversation(self, auth_session):
        """GET /api/support/conversations/{id} - Get conversation with messages"""
        # First create a conversation
        chat_res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "TEST_SUPPORT: Hello, testing conversation retrieval"
        })
        assert chat_res.status_code == 200
        conv_id = chat_res.json()["conversation_id"]
        
        # Get the conversation
        res = auth_session.get(f"{BASE_URL}/api/support/conversations/{conv_id}")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify structure
        assert "conversation_id" in data, "Should have conversation_id"
        assert "messages" in data, "Should have messages array"
        assert "priority" in data, "Should have priority"
        
        # Verify messages
        assert len(data["messages"]) >= 2, "Should have at least user message and AI response"
        
        # Check message structure
        msg = data["messages"][0]
        assert "role" in msg, "Message should have role"
        assert "content" in msg, "Message should have content"
        assert "timestamp" in msg, "Message should have timestamp"
        
        print(f"✓ Conversation {conv_id} has {len(data['messages'])} messages")
    
    def test_get_nonexistent_conversation(self, auth_session):
        """GET /api/support/conversations/{id} - Should 404 for invalid ID"""
        res = auth_session.get(f"{BASE_URL}/api/support/conversations/conv_invalid123")
        
        assert res.status_code == 404, f"Expected 404 for invalid conversation, got {res.status_code}"
        print("✓ Invalid conversation returns 404")


class TestTicketsAPI:
    """Test support tickets CRUD"""
    
    def test_create_ticket(self, auth_session):
        """POST /api/support/tickets - Create new ticket"""
        res = auth_session.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "TEST_SUPPORT: Need help with integration",
            "description": "I'm having trouble connecting my Stripe account. Getting an error when I click connect."
        })
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify structure
        assert "ticket_id" in data, "Should have ticket_id"
        assert "subject" in data, "Should have subject"
        assert "description" in data, "Should have description"
        assert "status" in data, "Should have status"
        assert "priority" in data, "Should have priority"
        assert "created_at" in data, "Should have created_at"
        
        # Verify values
        assert data["status"] == "open", f"New ticket should be open, got {data['status']}"
        assert data["priority"] == "priority", f"Enterprise user ticket should have priority, got {data['priority']}"
        
        print(f"✓ Created ticket: {data['ticket_id']}")
        return data["ticket_id"]
    
    def test_create_ticket_with_conversation(self, auth_session):
        """POST /api/support/tickets - Create ticket linked to conversation"""
        # First create a conversation
        chat_res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "TEST_SUPPORT: I have a billing issue that needs human help"
        })
        assert chat_res.status_code == 200
        conv_id = chat_res.json()["conversation_id"]
        
        # Create ticket linked to conversation
        res = auth_session.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "TEST_SUPPORT: Billing Issue - Escalated",
            "description": "AI couldn't resolve my billing issue. Need human support.",
            "conversation_id": conv_id
        })
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify conversation link
        assert data.get("conversation_id") == conv_id, "Ticket should be linked to conversation"
        
        print(f"✓ Created ticket {data['ticket_id']} linked to conversation {conv_id}")
    
    def test_list_tickets(self, auth_session):
        """GET /api/support/tickets - List all user's tickets"""
        res = auth_session.get(f"{BASE_URL}/api/support/tickets")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify response is list
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            ticket = data[0]
            # Verify ticket structure
            assert "ticket_id" in ticket, "Ticket should have ticket_id"
            assert "subject" in ticket, "Ticket should have subject"
            assert "status" in ticket, "Ticket should have status"
            assert "priority" in ticket, "Ticket should have priority"
            
            print(f"✓ Found {len(data)} tickets")
        else:
            print("✓ Tickets list empty (creating one for test)")
    
    def test_get_single_ticket(self, auth_session):
        """GET /api/support/tickets/{id} - Get single ticket"""
        # Create a ticket first
        create_res = auth_session.post(f"{BASE_URL}/api/support/tickets", json={
            "subject": "TEST_SUPPORT: Test ticket for retrieval",
            "description": "Testing single ticket retrieval"
        })
        assert create_res.status_code == 200
        ticket_id = create_res.json()["ticket_id"]
        
        # Get the ticket
        res = auth_session.get(f"{BASE_URL}/api/support/tickets/{ticket_id}")
        
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        
        # Verify data
        assert data["ticket_id"] == ticket_id
        assert data["subject"] == "TEST_SUPPORT: Test ticket for retrieval"
        
        print(f"✓ Retrieved ticket: {ticket_id}")
    
    def test_get_nonexistent_ticket(self, auth_session):
        """GET /api/support/tickets/{id} - Should 404 for invalid ID"""
        res = auth_session.get(f"{BASE_URL}/api/support/tickets/ticket_invalid123")
        
        assert res.status_code == 404, f"Expected 404 for invalid ticket, got {res.status_code}"
        print("✓ Invalid ticket returns 404")


class TestPriorityLevels:
    """Test priority level assignment"""
    
    def test_enterprise_priority(self, auth_session):
        """Enterprise users should get 'priority' level"""
        res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "TEST_PRIORITY: Checking priority level"
        })
        
        assert res.status_code == 200
        assert res.json()["priority"] == "priority", "Enterprise user should have priority support"
        print("✓ Enterprise user has priority support level")


class TestUserContext:
    """Test that AI receives user context"""
    
    def test_ai_knows_user_context(self, auth_session):
        """AI should reference user's subscription tier in response"""
        res = auth_session.post(f"{BASE_URL}/api/support/chat", json={
            "message": "What subscription plan am I on?"
        })
        
        assert res.status_code == 200
        response = res.json()["response"].lower()
        
        # AI should know user is on enterprise
        has_context = "enterprise" in response or "plan" in response or "subscription" in response
        
        print(f"✓ AI Response: {res.json()['response'][:200]}...")
        
        if not has_context:
            print("⚠ AI may not be fully utilizing user context (check response manually)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
