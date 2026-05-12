-- Backfill shape text alignment so the centered default is explicit in stored canvas style.
update public.canvas_elements
set style = jsonb_set(
  coalesce(style, '{}'::jsonb),
  '{text_align}',
  to_jsonb('center'::text),
  true
)
where element_type = 'shape'
  and (
    not (coalesce(style, '{}'::jsonb) ? 'text_align')
    or coalesce(style->'text_align', 'null'::jsonb) = 'null'::jsonb
  );
