-- Accept concise product ideas; progressive questions supply the detail later.
alter table public.ideas drop constraint ideas_text_check;
alter table public.ideas add constraint ideas_text_check
  check (char_length(btrim(text)) between 1 and 2000);
