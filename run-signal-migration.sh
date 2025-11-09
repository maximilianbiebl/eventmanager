#!/bin/bash
# Script to run Signal notifications migration

echo "========================================="
echo "Signal Notifications Migration"
echo "========================================="
echo ""
echo "This script will add Signal notification support to the database."
echo ""

# Check if we're in the right directory
if [ ! -f "backend/package.json" ]; then
  echo "❌ Error: Please run this script from the eventmanager root directory"
  exit 1
fi

echo "📋 Migration will add the following columns to the 'users' table:"
echo "   - signal_enabled (for all users)"
echo "   - signal_phone_number (for all users)"
echo "   - web_push_enabled (for all users)"
echo "   - signal_account_number (for teamleiter/admin)"
echo "   - signal_device_id (for teamleiter/admin)"
echo "   - signal_linked (for teamleiter/admin)"
echo "   - signal_linked_at (for teamleiter/admin)"
echo ""

# Confirm before proceeding
read -p "Continue with migration? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Migration cancelled."
  exit 0
fi

echo ""
echo "🚀 Running migration..."
echo ""

cd backend

# Run the migration
npm run migrate:011

# Check if migration was successful
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
  echo ""
  echo "Next steps:"
  echo "1. Restart the backend if it's running:"
  echo "   - Development: npm run dev"
  echo "   - Docker: docker-compose restart backend"
  echo ""
  echo "2. Login as Teamleiter or Admin"
  echo "3. Open Settings and check the 'Signal Setup' tab"
  echo ""
  echo "See SIGNAL_FIX.md for more details."
else
  echo ""
  echo "❌ Migration failed!"
  echo ""
  echo "Please check the error message above."
  echo "See SIGNAL_FIX.md for troubleshooting help."
  exit 1
fi
