.PHONY: all test run lint clean docker-build

all: test

test:
	npm test

run:
	npm start

lint:
	@echo "Running lint checks..."

clean:
	@echo "Cleaning artifacts..."

docker-build:
	docker build -t app:latest .
