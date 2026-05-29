-- CKOS Phase 1.5 Slice 1: Resolver validation (run after 100001 in CI or supabase db test)
-- These assertions document expected alias resolution behavior.

DO $$
DECLARE
  r RECORD;
  norm TEXT;
BEGIN
  -- Normalization unit checks
  norm := public.normalize_entity_alias('  Open  Pose!!  ');
  IF norm IS DISTINCT FROM 'open pose' THEN
    RAISE EXCEPTION 'normalize failed: got %', norm;
  END IF;

  norm := public.normalize_entity_alias('OpenPose');
  IF norm IS DISTINCT FROM 'openpose' THEN
    RAISE EXCEPTION 'normalize OpenPose failed: got %', norm;
  END IF;

  norm := public.normalize_entity_alias('OpenPose ControlNet');
  IF norm IS DISTINCT FROM 'openpose controlnet' THEN
    RAISE EXCEPTION 'normalize controlnet failed: got %', norm;
  END IF;

  norm := public.normalize_entity_alias('openpose_controlnet');
  IF norm IS DISTINCT FROM 'openpose controlnet' THEN
    RAISE EXCEPTION 'normalize slug failed: got %', norm;
  END IF;

  -- All seed aliases for openpose_controlnet resolve to one entity
  FOR r IN
    SELECT * FROM public.resolve_entity_alias('comfyui', 'OpenPose')
  LOOP
    IF r.canonical_slug <> 'openpose_controlnet' THEN
      RAISE EXCEPTION 'OpenPose resolve failed: %', r.canonical_slug;
    END IF;
  END LOOP;

  FOR r IN
    SELECT * FROM public.resolve_entity_alias('comfyui', 'Open Pose')
  LOOP
    IF r.canonical_slug <> 'openpose_controlnet' THEN
      RAISE EXCEPTION 'Open Pose resolve failed';
    END IF;
  END LOOP;

  FOR r IN
    SELECT * FROM public.resolve_entity_alias('comfyui', 'openpose_controlnet')
  LOOP
    IF r.match_type <> 'slug_exact' AND r.match_type <> 'alias_exact' THEN
      RAISE EXCEPTION 'slug resolve unexpected match_type: %', r.match_type;
    END IF;
  END LOOP;

  -- Flux dev aliases
  FOR r IN
    SELECT * FROM public.resolve_entity_alias('comfyui', 'flux.1 dev')
  LOOP
    IF r.canonical_slug <> 'flux_dev' THEN
      RAISE EXCEPTION 'flux.1 dev resolve failed: %', r.canonical_slug;
    END IF;
  END LOOP;

  RAISE NOTICE 'CKOS entity resolver SQL tests passed';
END $$;
