# tools/office-mac — one mechanism for the four verbs (plan 054 phase 4).
STACKS = listmonk immich documenso rustdesk excalidraw-room

.PHONY: up down status seed

up:
	./bootstrap.sh

# down removes containers but KEEPS volumes/data — and is the ONLY correct way
# to retire a stack under colima (plain `docker stop` gets resurrected by
# restart policies on the next colima start; see README gotchas).
down:
	for s in $(STACKS); do \
		docker compose --project-directory ../$$s -p dwellium-$$s down; \
	done

status:
	./healthcheck.sh

seed:
	./seed.sh
