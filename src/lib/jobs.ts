export type Job = {
  id: string;
  title: string;
  location: string;
  listingDescription: string;
  responsibilities: string[];
  requirements: string[];
  benefit: string;
};

const responsibilities = [
  "Your responsibilities include creating visually appealing graphics, illustrations, layouts and generating still graphics and motion graphics weekly.",
  "Collaborate with the PR team to brainstorm and create design concepts that align with project goals and objectives.",
  "Maintain and enhance brand consistency by adhering to established design guidelines and standards across all materials.",
  "Edit and retouch photos and images to enhance visual appeal and ensure they are in line with project requirements.",
  "Choose fonts that enhance the visual appeal and readability of text within designs while ensuring there are no typographical errors during the design process and output.",
  "Receive feedback from team members and management team and make necessary revisions to designs.",
  "Maintain an organized library for easy access to design files by uploading all graphics to the company's drive.",
  "Respond promptly to any emergency tasks or requests that may arise within the organization.",
  "Assist in coordinating content-related activities and ensuring that schedules are maintained efficiently.",
];

const requirements = [
  "Proven experience as a Graphic Designer, with a strong portfolio showcasing creative design work across various media.",
  "Proficiency in design software such as Adobe Creative Suite (Illustrator, Photoshop, InDesign), CorelDRAW, and other relevant tools.",
  "Strong verbal and written communication skills, with the ability to collaborate effectively with different teams.",
];

// These ids match seeded rows in the job_postings table (see
// supabase/migrations/20260826160000_seed_job_postings.sql) so that
// submitting an application has a real job_id to reference. Full admin
// CRUD for job postings (replacing this hardcoded list entirely) is
// still Step 6b.
export const jobs: Job[] = [
  "a1e1c1a0-0001-4a1a-8b1a-000000000001",
  "a1e1c1a0-0001-4a1a-8b1a-000000000002",
  "a1e1c1a0-0001-4a1a-8b1a-000000000003",
  "a1e1c1a0-0001-4a1a-8b1a-000000000004",
].map((id) => ({
  id,
  title: "DevOps Engineer",
  location: "Remote | Full Time",
  listingDescription:
    "DevOps Engineer Job Overview: The DevOps Engineer will be responsible for building, automating, and maintaining the company's...",
  responsibilities,
  requirements,
  benefit: "Remote Work HMO",
}));
