// Mock email data for testing the UI
export const mockFolders = [
    { id: 1, name: 'Inbox', icon: 'inbox', color: '#3b82f6', user_id: 1 },
    { id: 2, name: 'Starred', icon: 'star', color: '#fbbf24', user_id: 1 },
    { id: 3, name: 'Snoozed', icon: 'clock', color: '#8b5cf6', user_id: 1 },
    { id: 4, name: 'Sent', icon: 'send', color: '#10b981', user_id: 1 },
    { id: 5, name: 'Drafts', icon: 'file-edit', color: '#f59e0b', user_id: 1 },
    { id: 6, name: 'Spam', icon: 'alert-triangle', color: '#ef4444', user_id: 1 },
    { id: 7, name: 'Trash', icon: 'trash-2', color: '#6b7280', user_id: 1 },
];

export const mockEmails = [
    {
        id: 1,
        from_name: 'Sarah Johnson',
        from_email: 'sarah.johnson@example.com',
        to_email: 'you@jeemail.in',
        subject: 'Project Update: Q4 Goals',
        body: 'Hi there! I wanted to share the latest updates on our Q4 goals. We\'ve made significant progress on the sustainability initiative and carbon tracking features. The team has been working hard to implement the new dashboard analytics. Looking forward to your feedback!',
        folder_id: 1,
        is_read: false,
        is_starred: true,
        is_snoozed: false,
        created_at: '2024-11-30T10:30:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 2,
        from_name: 'Marketing Team',
        from_email: 'marketing@company.com',
        to_email: 'you@jeemail.in',
        subject: 'New Campaign Launch Next Week',
        body: 'Exciting news! We\'re launching our new eco-friendly campaign next week. This aligns perfectly with our carbon credit initiative. Please review the attached materials and provide your input by Friday.',
        folder_id: 1,
        is_read: true,
        is_starred: false,
        is_snoozed: false,
        created_at: '2024-11-29T14:20:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 3,
        from_name: 'Tech Support',
        from_email: 'support@jeemail.in',
        to_email: 'you@jeemail.in',
        subject: 'Your Storage Upgrade is Complete',
        body: 'Great news! Your storage has been successfully upgraded to 5GB. You can now store more emails and attachments. Your carbon credits have also been updated based on your eco-friendly email practices.',
        folder_id: 1,
        is_read: false,
        is_starred: true,
        is_snoozed: false,
        created_at: '2024-11-29T09:15:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 4,
        from_name: 'John Smith',
        from_email: 'john.smith@example.com',
        to_email: 'you@jeemail.in',
        subject: 'Meeting Tomorrow at 2 PM',
        body: 'Hi! Just a reminder about our meeting tomorrow at 2 PM. We\'ll be discussing the new features and timeline for the next sprint. See you there!',
        folder_id: 1,
        is_read: true,
        is_starred: false,
        is_snoozed: true,
        created_at: '2024-11-28T16:45:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 5,
        from_name: 'Newsletter',
        from_email: 'newsletter@ecofriendly.com',
        to_email: 'you@jeemail.in',
        subject: 'Weekly Eco Tips: Reduce Your Carbon Footprint',
        body: 'This week\'s tips: 1) Use digital documents instead of printing 2) Optimize your email storage 3) Use P2P file sharing to save energy. Every small action counts towards a greener planet!',
        folder_id: 1,
        is_read: true,
        is_starred: false,
        is_snoozed: false,
        created_at: '2024-11-27T08:00:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 6,
        from_name: 'HR Department',
        from_email: 'hr@company.com',
        to_email: 'you@jeemail.in',
        subject: 'Carbon Credits Reward Program',
        body: 'Congratulations! You\'ve earned 25 carbon credits this month through eco-friendly email practices. Keep up the great work! Your contributions are making a real difference.',
        folder_id: 1,
        is_read: false,
        is_starred: true,
        is_snoozed: false,
        created_at: '2024-11-26T11:30:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 7,
        from_name: 'Alice Williams',
        from_email: 'alice.w@example.com',
        to_email: 'you@jeemail.in',
        subject: 'Draft: Proposal for Green Initiative',
        body: 'Here\'s the draft proposal for our green initiative. Please review and let me know your thoughts. I\'ve included data on potential carbon savings and implementation costs.',
        folder_id: 5,
        is_read: false,
        is_starred: false,
        is_snoozed: false,
        created_at: '2024-11-25T13:20:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 8,
        from_name: 'System Notification',
        from_email: 'noreply@jeemail.in',
        to_email: 'you@jeemail.in',
        subject: 'Your Monthly Carbon Report',
        body: 'Your carbon footprint this month: 2.3 kg CO2 saved! You\'re in the top 10% of eco-friendly users. Keep using P2P transfers and optimizing your storage to earn more credits.',
        folder_id: 1,
        is_read: true,
        is_starred: false,
        is_snoozed: false,
        created_at: '2024-11-24T07:00:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 9,
        from_name: 'Spam Bot',
        from_email: 'spam@suspicious.com',
        to_email: 'you@jeemail.in',
        subject: 'You Won a Million Dollars!!!',
        body: 'Congratulations! Click here to claim your prize... (This is obviously spam)',
        folder_id: 6,
        is_read: false,
        is_starred: false,
        is_snoozed: false,
        created_at: '2024-11-23T12:00:00Z',
        thread_id: null,
        user_id: 1
    },
    {
        id: 10,
        from_name: 'Team Lead',
        from_email: 'lead@company.com',
        to_email: 'you@jeemail.in',
        subject: 'Great Job on the Dashboard!',
        body: 'The new dashboard looks amazing! The premium UI with gradients and glassmorphism really makes it stand out. Users are going to love it. Excellent work!',
        folder_id: 1,
        is_read: false,
        is_starred: true,
        is_snoozed: false,
        created_at: '2024-11-30T15:45:00Z',
        thread_id: null,
        user_id: 1
    }
];

// Enable/disable mock mode - Set to true to use dummy data
export const USE_MOCK_DATA = true;

// Mock user data
export const mockUser = {
    id: 1,
    email: 'demo@jeemail.in',
    full_name: 'Demo User',
    storage_used: 524288000, // 500 MB
    storage_limit: 1073741824, // 1 GB
    carbon_credits: 45.5
};
