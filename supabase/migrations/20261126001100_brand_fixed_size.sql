-- =============================================================================
-- TickLO – "Ticket partner: TickLO" has one fixed size on printed tickets (D-040)
-- Owner rule: organizers may move the TickLO logo but never make it smaller (or
-- fainter). The brand layer must be 29 × 10.2 mm (290 × 102 design units) at
-- full opacity. Same rule as lib/print/design.ts → designProblems.
-- =============================================================================

create or replace function public.print_design_problem(p_design jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_w numeric;
  v_h numeric;
  v_qr jsonb;
  v_qr_count int;
  v_brand_ok boolean;
begin
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    return 'The ticket design is missing.';
  end if;
  if octet_length(p_design::text) > 400000 then
    return 'The ticket design is too large. Remove some images or shapes.';
  end if;
  if coalesce(p_design ->> 'version', '') <> '1' then
    return 'Unknown design version. Reload the editor and try again.';
  end if;
  if jsonb_typeof(p_design -> 'width') <> 'number' or jsonb_typeof(p_design -> 'height') <> 'number'
     or jsonb_typeof(p_design -> 'layers') <> 'array' then
    return 'The ticket design is damaged. Reload the editor and try again.';
  end if;
  v_w := (p_design ->> 'width')::numeric;
  v_h := (p_design ->> 'height')::numeric;
  if v_w < 400 or v_w > 3000 or v_h < 300 or v_h > 3000 then
    return 'Ticket size must be between 40 × 30 mm and 300 × 300 mm.';
  end if;
  if jsonb_array_length(p_design -> 'layers') > 300 then
    return 'Too many layers in the design (max 300).';
  end if;

  select count(*), (array_agg(l))[1]
  into v_qr_count, v_qr
  from jsonb_array_elements(p_design -> 'layers') l
  where l ->> 'type' = 'qr';
  if v_qr_count <> 1 then
    return 'The ticket must have exactly one QR code.';
  end if;
  if coalesce((v_qr ->> 'hidden')::boolean, false) then
    return 'The QR code cannot be hidden.';
  end if;
  if jsonb_typeof(v_qr -> 'size') <> 'number' or jsonb_typeof(v_qr -> 'x') <> 'number' or jsonb_typeof(v_qr -> 'y') <> 'number' then
    return 'The QR code layer is damaged.';
  end if;
  if (v_qr ->> 'size')::numeric < 200 then
    return 'The QR code must be at least 20 mm wide so phones can scan it.';
  end if;
  if coalesce((v_qr ->> 'rotation')::numeric, 0) <> 0 then
    return 'The QR code cannot be rotated.';
  end if;
  if (v_qr ->> 'x')::numeric < 0 or (v_qr ->> 'y')::numeric < 0
     or (v_qr ->> 'x')::numeric + (v_qr ->> 'size')::numeric > v_w
     or (v_qr ->> 'y')::numeric + (v_qr ->> 'size')::numeric > v_h then
    return 'The QR code must be fully on the ticket.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(p_design -> 'layers') l
    where l ->> 'type' = 'brand'
      and not coalesce((l ->> 'hidden')::boolean, false)
      and jsonb_typeof(l -> 'width') = 'number' and jsonb_typeof(l -> 'height') = 'number'
      and jsonb_typeof(l -> 'x') = 'number' and jsonb_typeof(l -> 'y') = 'number'
      and abs((l ->> 'width')::numeric - 290) <= 1
      and abs((l ->> 'height')::numeric - 102) <= 2
      and coalesce((l ->> 'opacity')::numeric, 1) >= 0.99
      and coalesce((l ->> 'rotation')::numeric, 0) = 0
      and (l ->> 'x')::numeric >= 0 and (l ->> 'y')::numeric >= 0
      and (l ->> 'x')::numeric + (l ->> 'width')::numeric <= v_w
      and (l ->> 'y')::numeric + (l ->> 'height')::numeric <= v_h
  ) into v_brand_ok;
  if not v_brand_ok then
    return 'The "Ticket partner: TickLO" logo must be on the ticket at its normal size (29 mm wide) and fully visible. You can move it, not shrink it.';
  end if;
  return null;
end;
$$;
