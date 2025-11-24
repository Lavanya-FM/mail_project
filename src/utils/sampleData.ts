import { supabase } from '../lib/supabase';

const sampleEmails = [
  {
    from_name: 'Sarah Johnson',
    from_email: 'sarah.johnson@company.com',
    subject: 'Q4 Marketing Strategy Review',
    body: `Hi Team,

I hope this email finds you well. I wanted to share some thoughts on our Q4 marketing strategy and get your feedback.

After reviewing our performance metrics from Q3, I believe we have a significant opportunity to expand our digital presence. The numbers show a 45% increase in social media engagement, and our email campaigns are performing better than ever.

Here are the key points I'd like to discuss:

1. Increasing our content marketing budget by 25%
2. Launching a new video series targeting Gen Z audiences
3. Partnering with micro-influencers in our niche
4. Implementing an AI-driven personalization strategy

I've attached a detailed proposal document for your review. Please take a look and let me know your thoughts before our meeting next Tuesday.

Looking forward to hearing your insights!

Best regards,
Sarah`,
    labels: [{ name: 'Work', color: '#3B82F6' }],
  },
  {
    from_name: 'Alex Chen',
    from_email: 'alex.chen@techstartup.io',
    subject: 'Re: API Integration Update',
    body: `Hey!

Great news - I've successfully completed the API integration we discussed last week. The new endpoints are now live and tested across all environments.

Performance improvements:
- Response time reduced by 60%
- Error rate down to 0.02%
- Successfully handling 10k requests/minute

The documentation is updated and available on our internal wiki. Let me know if you need any clarifications or want to discuss the implementation details.

Cheers,
Alex`,
    labels: [
      { name: 'Development', color: '#10B981' },
      { name: 'Important', color: '#F59E0B' },
    ],
    is_starred: true,
  },
  {
    from_name: 'Emily Rodriguez',
    from_email: 'emily.r@designs.co',
    subject: 'New Design System Components',
    body: `Hello!

I'm excited to share the latest updates to our design system. We've added 15 new components and refined existing ones based on user feedback.

New additions include:
- Advanced data visualization charts
- Interactive timeline components
- Customizable card layouts
- Enhanced form elements with better validation

All components are now available in Figma and have been documented with usage guidelines and best practices.

Let me know what you think!

Emily`,
    labels: [{ name: 'Design', color: '#EC4899' }],
    has_attachments: true,
  },
  {
    from_name: 'Michael Thompson',
    from_email: 'mthompson@finance.com',
    subject: 'Budget Approval Request - Project Atlas',
    body: `Dear Team,

I'm writing to request budget approval for Project Atlas, our new customer analytics platform.

Requested Budget: $150,000
Timeline: 6 months
Expected ROI: 300% within first year

This investment will enable us to:
- Better understand customer behavior patterns
- Improve retention by 25%
- Increase average customer lifetime value
- Streamline our reporting processes

I've prepared a comprehensive business case with detailed financial projections. Happy to discuss this in more detail at your convenience.

Best,
Michael`,
    labels: [{ name: 'Finance', color: '#8B5CF6' }],
    is_starred: true,
  },
  {
    from_name: 'Lisa Park',
    from_email: 'lpark@hr.company.com',
    subject: 'Team Building Event - Save the Date',
    body: `Hi Everyone!

Mark your calendars! We're organizing a team building event for next month.

Date: Friday, December 15th
Time: 2:00 PM - 6:00 PM
Location: Riverside Adventure Park

Activities planned:
- Escape room challenge
- Team cooking competition
- Outdoor adventure course
- Networking dinner

This will be a great opportunity to connect with colleagues and have some fun outside the office. More details to follow!

RSVP by December 1st.

Thanks,
Lisa`,
    labels: [{ name: 'Social', color: '#14B8A6' }],
  },
];

export async function createSampleEmails(userId: string, inboxFolderId: string) {
  const emailsToInsert = sampleEmails.map((email, index) => ({
    user_id: userId,
    folder_id: inboxFolderId,
    from_name: email.from_name,
    from_email: email.from_email,
    to_emails: [{ email: 'me@example.com', name: 'Me' }],
    subject: email.subject,
    body: email.body,
    is_read: index > 1,
    is_starred: email.is_starred || false,
    has_attachments: email.has_attachments || false,
    labels: email.labels || [],
    sent_at: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase.from('emails').insert(emailsToInsert);

  if (error) {
    console.error('Error creating sample emails:', error);
    throw error;
  }
}
