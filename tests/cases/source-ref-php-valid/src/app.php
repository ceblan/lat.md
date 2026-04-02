<?php

class Greeter {
    private $prefix;

    public function greet(string $name): string {
        return $this->prefix . ' ' . $name;
    }
}

interface Repository {
    public function find(int $id): ?object;
}

trait Loggable {
    public function log(string $msg): void {}
}

enum Status: string {
    case Active = 'active';
    case Inactive = 'inactive';
}

function helper(string $name): string {
    return 'Hello ' . $name;
}

const MAX_RETRIES = 3;

abstract class BaseAction {
    abstract protected function execute(): void;
}
