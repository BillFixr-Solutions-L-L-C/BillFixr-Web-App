-- Seeds job_postings with the same 4 mock listings src/lib/jobs.ts has
-- hardcoded, so job_applications (job_id -> job_postings.id, uuid FK)
-- has real rows to reference. src/lib/jobs.ts itself gets updated to use
-- these same ids. Full admin CRUD for job postings is still Step 6b —
-- this is just enough seed data to unblock Step 2d (applications).
insert into public.job_postings (id, title, location, listing_description, responsibilities, requirements, benefit, status)
values
  (
    'a1e1c1a0-0001-4a1a-8b1a-000000000001',
    'DevOps Engineer',
    'Remote | Full Time',
    'DevOps Engineer Job Overview: The DevOps Engineer will be responsible for building, automating, and maintaining the company''s...',
    array[
      'Your responsibilities include creating visually appealing graphics, illustrations, layouts and generating still graphics and motion graphics weekly.',
      'Collaborate with the PR team to brainstorm and create design concepts that align with project goals and objectives.',
      'Maintain and enhance brand consistency by adhering to established design guidelines and standards across all materials.',
      'Edit and retouch photos and images to enhance visual appeal and ensure they are in line with project requirements.',
      'Choose fonts that enhance the visual appeal and readability of text within designs while ensuring there are no typographical errors during the design process and output.',
      'Receive feedback from team members and management team and make necessary revisions to designs.',
      'Maintain an organized library for easy access to design files by uploading all graphics to the company''s drive.',
      'Respond promptly to any emergency tasks or requests that may arise within the organization.',
      'Assist in coordinating content-related activities and ensuring that schedules are maintained efficiently.'
    ],
    array[
      'Proven experience as a Graphic Designer, with a strong portfolio showcasing creative design work across various media.',
      'Proficiency in design software such as Adobe Creative Suite (Illustrator, Photoshop, InDesign), CorelDRAW, and other relevant tools.',
      'Strong verbal and written communication skills, with the ability to collaborate effectively with different teams.'
    ],
    'Remote Work HMO',
    'open'
  ),
  (
    'a1e1c1a0-0001-4a1a-8b1a-000000000002',
    'DevOps Engineer',
    'Remote | Full Time',
    'DevOps Engineer Job Overview: The DevOps Engineer will be responsible for building, automating, and maintaining the company''s...',
    array[
      'Your responsibilities include creating visually appealing graphics, illustrations, layouts and generating still graphics and motion graphics weekly.',
      'Collaborate with the PR team to brainstorm and create design concepts that align with project goals and objectives.',
      'Maintain and enhance brand consistency by adhering to established design guidelines and standards across all materials.',
      'Edit and retouch photos and images to enhance visual appeal and ensure they are in line with project requirements.',
      'Choose fonts that enhance the visual appeal and readability of text within designs while ensuring there are no typographical errors during the design process and output.',
      'Receive feedback from team members and management team and make necessary revisions to designs.',
      'Maintain an organized library for easy access to design files by uploading all graphics to the company''s drive.',
      'Respond promptly to any emergency tasks or requests that may arise within the organization.',
      'Assist in coordinating content-related activities and ensuring that schedules are maintained efficiently.'
    ],
    array[
      'Proven experience as a Graphic Designer, with a strong portfolio showcasing creative design work across various media.',
      'Proficiency in design software such as Adobe Creative Suite (Illustrator, Photoshop, InDesign), CorelDRAW, and other relevant tools.',
      'Strong verbal and written communication skills, with the ability to collaborate effectively with different teams.'
    ],
    'Remote Work HMO',
    'open'
  ),
  (
    'a1e1c1a0-0001-4a1a-8b1a-000000000003',
    'DevOps Engineer',
    'Remote | Full Time',
    'DevOps Engineer Job Overview: The DevOps Engineer will be responsible for building, automating, and maintaining the company''s...',
    array[
      'Your responsibilities include creating visually appealing graphics, illustrations, layouts and generating still graphics and motion graphics weekly.',
      'Collaborate with the PR team to brainstorm and create design concepts that align with project goals and objectives.',
      'Maintain and enhance brand consistency by adhering to established design guidelines and standards across all materials.',
      'Edit and retouch photos and images to enhance visual appeal and ensure they are in line with project requirements.',
      'Choose fonts that enhance the visual appeal and readability of text within designs while ensuring there are no typographical errors during the design process and output.',
      'Receive feedback from team members and management team and make necessary revisions to designs.',
      'Maintain an organized library for easy access to design files by uploading all graphics to the company''s drive.',
      'Respond promptly to any emergency tasks or requests that may arise within the organization.',
      'Assist in coordinating content-related activities and ensuring that schedules are maintained efficiently.'
    ],
    array[
      'Proven experience as a Graphic Designer, with a strong portfolio showcasing creative design work across various media.',
      'Proficiency in design software such as Adobe Creative Suite (Illustrator, Photoshop, InDesign), CorelDRAW, and other relevant tools.',
      'Strong verbal and written communication skills, with the ability to collaborate effectively with different teams.'
    ],
    'Remote Work HMO',
    'open'
  ),
  (
    'a1e1c1a0-0001-4a1a-8b1a-000000000004',
    'DevOps Engineer',
    'Remote | Full Time',
    'DevOps Engineer Job Overview: The DevOps Engineer will be responsible for building, automating, and maintaining the company''s...',
    array[
      'Your responsibilities include creating visually appealing graphics, illustrations, layouts and generating still graphics and motion graphics weekly.',
      'Collaborate with the PR team to brainstorm and create design concepts that align with project goals and objectives.',
      'Maintain and enhance brand consistency by adhering to established design guidelines and standards across all materials.',
      'Edit and retouch photos and images to enhance visual appeal and ensure they are in line with project requirements.',
      'Choose fonts that enhance the visual appeal and readability of text within designs while ensuring there are no typographical errors during the design process and output.',
      'Receive feedback from team members and management team and make necessary revisions to designs.',
      'Maintain an organized library for easy access to design files by uploading all graphics to the company''s drive.',
      'Respond promptly to any emergency tasks or requests that may arise within the organization.',
      'Assist in coordinating content-related activities and ensuring that schedules are maintained efficiently.'
    ],
    array[
      'Proven experience as a Graphic Designer, with a strong portfolio showcasing creative design work across various media.',
      'Proficiency in design software such as Adobe Creative Suite (Illustrator, Photoshop, InDesign), CorelDRAW, and other relevant tools.',
      'Strong verbal and written communication skills, with the ability to collaborate effectively with different teams.'
    ],
    'Remote Work HMO',
    'open'
  )
on conflict (id) do nothing;
