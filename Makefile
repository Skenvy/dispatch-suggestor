ifeq ($(OS),Windows_NT)
NVM=
_=
NPM=npm
INSTALL_NODE=
INSTALL_NPM=
else
NVM=source $$NVM_DIR/nvm.sh && nvm
_=$(NVM) use &&
NPM=$(_) npm
INSTALL_NODE=$(NVM) install $$(cat ./.nvmrc)
INSTALL_NPM=$(NPM) i -g npm@$$(cat ./.npm-version)
endif
SCOPE=skenvy
PKG_NAME=dispatch-suggestor
SCOPED_PKG_NAME=$(SCOPE)-$(PKG_NAME)

SHELL:=/bin/bash

# Versions can be manually changed where they appear in the package json and
# package lock json, or updated in the package json and run `npm i`. These
# recipes are a reminder that the lock file must be updated or packaging will
# throw an error on the lock file being out of date.
.PHONY: bump_major bump_minor bump_patch

bump_major:
	$(NPM) version major
	$(NPM) i --package-lock-only

bump_minor:
	$(NPM) version minor
	$(NPM) i --package-lock-only

bump_patch:
	$(NPM) version patch
	$(NPM) i --package-lock-only

.PHONY: install_node install_npm setup

install_node:
	$(INSTALL_NODE)

install_npm: install_node
	$(INSTALL_NPM)

# https://docs.npmjs.com/cli/v11/commands/npm-ci
setup: install_npm
	$(NPM) list -g --depth 0
	$(NPM) ci
	$(NPM) list

# https://docs.npmjs.com/cli/v11/commands/npm-outdated
.PHONY: outdated
outdated:
	$(NPM) outdated

# https://docs.npmjs.com/cli/v11/commands/npm-install
.PHONY: install
install: install_npm
	$(NPM) install

# https://docs.npmjs.com/cli/v11/commands/npm-update
.PHONY: update
update: install_npm
	$(NPM) update --save

.PHONY: clean
clean:
	rm -f $(SCOPED_PKG_NAME)-*.tgz
	rm -rf docs
	rm -rf .nyc_output
	$(NPM) run clean

# https://docs.npmjs.com/cli/v11/commands/npm-test
# https://docs.npmjs.com/cli/v11/commands/npm-publish
.PHONY: test
test: clean
	$(NPM) test
	$(NPM) publish --dry-run

.PHONY: lint
lint:
	$(_) TIMING=1 npm run lint

# Confirm that the checked in lib folder's contents are what would be generated
# from transpiling the checked in typescript, to make sure they're in sync.
.PHONY: bundle
bundle: clean
	rm -rf dist
	$(NPM) run bundle

.PHONY: verify_transpiled_checkin
verify_transpiled_checkin: bundle
	echo "Exit if a change to the transpiled JavaScript is not committed"
	git add dist && git diff --exit-code --cached --stat -- dist/

# https://docs.npmjs.com/cli/v11/commands/npm-pack
.PHONY: build
build: clean test lint verify_transpiled_checkin
	$(NPM) pack

# https://docs.npmjs.com/cli/v11/commands/npm-publish
.PHONY: publish
publish:
	$(NPM) publish --access=public $(SCOPED_PKG_NAME)-*.tgz
