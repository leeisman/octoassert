package jsonpath

import (
	"fmt"
	"reflect"

	"github.com/tidwall/gjson"
)

// Extract parses the jsonStr and returns the value found at the specified JSONPath.
func Extract(jsonStr string, path string) (any, error) {
	if !gjson.Valid(jsonStr) {
		return nil, fmt.Errorf("invalid json string")
	}

	result := gjson.Get(jsonStr, path)
	if !result.Exists() {
		return nil, fmt.Errorf("path '%s' not found", path)
	}

	return result.Value(), nil
}

// Assert extracts the value from jsonStr at the given path and compares it with expected.
func Assert(jsonStr string, path string, expect any) (bool, error) {
	actual, err := Extract(jsonStr, path)
	if err != nil {
		return false, err
	}

	// For robust comparisons, it's often easiest to compare as strings or use reflect.DeepEqual
	// tidwall/gjson parses numbers as float64 usually.
	if fmt.Sprint(actual) == fmt.Sprint(expect) {
		return true, nil
	}
	
	if reflect.DeepEqual(actual, expect) {
		return true, nil
	}

	return false, fmt.Errorf("expected '%v' (type %T), got '%v' (type %T)", expect, expect, actual, actual)
}
