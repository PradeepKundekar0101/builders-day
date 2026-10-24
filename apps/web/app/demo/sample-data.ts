/** Fake rows for the generated preview. Nothing here is real data. */
export const SAMPLE: Record<string, { columns: string[]; rows: string[][] }> = {
  Orders: {
    columns: ["Customer", "Meal", "Day", "Status"],
    rows: [
      ["Asha R.", "Paneer thali", "Mon", "Confirmed"],
      ["Vikram S.", "Dal khichdi", "Mon", "Preparing"],
      ["Meera K.", "Veg biryani", "Tue", "Confirmed"],
      ["Rohan P.", "Rajma chawal", "Wed", "New"],
    ],
  },
  Meals: {
    columns: ["Meal", "Price", "Available", "Veg"],
    rows: [
      ["Paneer thali", "₹180", "Mon, Wed", "Yes"],
      ["Dal khichdi", "₹120", "Daily", "Yes"],
      ["Chicken curry", "₹220", "Tue, Fri", "No"],
      ["Veg biryani", "₹160", "Thu", "Yes"],
    ],
  },
  Bookings: {
    columns: ["Name", "Slot", "Date", "Status"],
    rows: [
      ["Priya N.", "7:00 AM", "Oct 26", "Confirmed"],
      ["Karan M.", "9:30 AM", "Oct 26", "Waitlist"],
      ["Sana A.", "6:00 PM", "Oct 27", "Confirmed"],
    ],
  },
  Classes: {
    columns: ["Class", "Instructor", "Time", "Spots"],
    rows: [
      ["Morning flow", "Anita", "7:00 AM", "4 left"],
      ["Power yoga", "Dev", "6:00 PM", "Full"],
      ["Breathwork", "Anita", "8:00 PM", "9 left"],
    ],
  },
  Products: {
    columns: ["Product", "Price", "Stock", "Category"],
    rows: [
      ["Handmade mug", "₹450", "12", "Kitchen"],
      ["Linen tote", "₹690", "30", "Bags"],
      ["Brass diya", "₹320", "8", "Decor"],
    ],
  },
  Clients: {
    columns: ["Client", "Company", "Project", "Last contact"],
    rows: [
      ["Neha G.", "Bloom Studio", "Website", "2 days ago"],
      ["Arjun T.", "Kite Labs", "App redesign", "Today"],
      ["Fatima Z.", "Orbit Co.", "Branding", "1 week ago"],
    ],
  },
  Tasks: {
    columns: ["Task", "Owner", "Due", "Status"],
    rows: [
      ["Draft proposal", "You", "Today", "In progress"],
      ["Send invoice", "You", "Fri", "To do"],
      ["Review design", "Team", "Mon", "Done"],
    ],
  },
  Invoices: {
    columns: ["Invoice", "Client", "Amount", "Status"],
    rows: [
      ["INV-1042", "Bloom Studio", "₹24,000", "Paid"],
      ["INV-1043", "Kite Labs", "₹56,500", "Due"],
      ["INV-1044", "Orbit Co.", "₹12,000", "Overdue"],
    ],
  },
  Notes: {
    columns: ["Title", "Date", "Mood"],
    rows: [
      ["Long walk by the lake", "Oct 22", "Calm"],
      ["Finished the book", "Oct 23", "Happy"],
      ["Busy day at work", "Oct 24", "Tired"],
    ],
  },
};

export const ACCENTS = ["#0f766e", "#7c3aed", "#c2410c", "#1d4ed8", "#be185d", "#15803d"];

export function accentFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length]!;
}
