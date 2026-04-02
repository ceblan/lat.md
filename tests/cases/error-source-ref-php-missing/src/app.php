<?php

class Greeter {
    public function greet(string $name): string {
        return 'Hello ' . $name;
    }
}

function helper(string $name): string {
    return $name;
}
