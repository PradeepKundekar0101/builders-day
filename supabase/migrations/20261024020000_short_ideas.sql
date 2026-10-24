-- Accept concise product ideas; progressive questions supply the detail later.
alter table public.ideas drop constraint if exists ideas_text_check;
alter table public.ideas drop constraint if exists ideas_text_length;
alter table public.ideas add constraint ideas_text_check
  check (char_length(btrim(text)) between 1 and 8000);
