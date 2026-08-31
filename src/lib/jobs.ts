import { createClient } from "@/lib/supabase/server";

export type Job = {
  id: string;
  title: string;
  location: string;
  listingDescription: string;
  responsibilities: string[];
  requirements: string[];
  benefit: string | null;
};

type JobRow = {
  id: string;
  title: string;
  location: string;
  listing_description: string;
  responsibilities: string[];
  requirements: string[];
  benefit: string | null;
};

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    listingDescription: row.listing_description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    benefit: row.benefit,
  };
}

const JOB_COLUMNS = "id, title, location, listing_description, responsibilities, requirements, benefit";

export async function getOpenJobs(): Promise<Job[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_postings")
    .select(JOB_COLUMNS)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapJob);
}

export async function getJobPosting(id: string): Promise<Job | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("job_postings").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  return data ? mapJob(data) : null;
}
