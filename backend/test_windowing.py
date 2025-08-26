#!/usr/bin/env python3
"""
Test script for sliding window vote pattern extraction functionality.
"""
import sys
sys.path.append('/Users/samibelhareth/Documents/vote-tracking/backend')

from main import create_text_windows, merge_vote_pattern_results
import json

def test_create_text_windows():
    """Test the create_text_windows function with various text lengths."""
    print("=== Testing create_text_windows function ===")
    
    # Test 1: Text below threshold (should return as-is)
    small_text = "A" * 20000  # 20k chars
    windows = create_text_windows(small_text)
    print(f"Small text (20k chars): {len(windows)} windows")
    assert len(windows) == 1
    assert windows[0] == small_text
    print("✓ Small text test passed")
    
    # Test 2: Text at threshold (should return as-is)
    threshold_text = "B" * 25000  # 25k chars
    windows = create_text_windows(threshold_text)
    print(f"Threshold text (25k chars): {len(windows)} windows")
    assert len(windows) == 1
    assert windows[0] == threshold_text
    print("✓ Threshold text test passed")
    
    # Test 3: Text just over threshold (should create 2 windows)
    over_threshold_text = "C" * 30000  # 30k chars
    windows = create_text_windows(over_threshold_text)
    print(f"Over threshold text (30k chars): {len(windows)} windows")
    assert len(windows) == 2
    assert len(windows[0]) == 20000  # First window: 0-19999
    assert len(windows[1]) == 20000  # Second window: 10000-29999 (20k chars)
    assert windows[0] == "C" * 20000
    assert windows[1] == "C" * 20000
    print("✓ Over threshold text test passed")
    
    # Test 4: Text requiring exactly 4 windows (50k chars)
    large_text = "D" * 50000  # 50k chars
    windows = create_text_windows(large_text)
    print(f"Large text (50k chars): {len(windows)} windows")
    expected_windows = 4  # 0-20k, 10k-30k, 20k-40k, 30k-50k
    assert len(windows) == expected_windows
    
    # Check window sizes and positions
    assert len(windows[0]) == 20000  # chars 0-19999
    assert len(windows[1]) == 20000  # chars 10000-29999
    assert len(windows[2]) == 20000  # chars 20000-39999
    assert len(windows[3]) == 20000  # chars 30000-49999
    
    # Check overlap
    assert windows[0][10000:] == windows[1][:10000]  # Overlap between window 0 and 1
    assert windows[1][10000:] == windows[2][:10000]  # Overlap between window 1 and 2
    assert windows[2][10000:] == windows[3][:10000]  # Overlap between window 2 and 3
    print("✓ Large text windowing test passed")
    
    print("All windowing tests passed! ✓\n")

def test_merge_vote_pattern_results():
    """Test the merge_vote_pattern_results function."""
    print("=== Testing merge_vote_pattern_results function ===")
    
    # Test 1: Empty results
    result = merge_vote_pattern_results([])
    assert result == {"bills": []}
    print("✓ Empty results test passed")
    
    # Test 2: Single result
    single_result = {
        "bills": [
            {
                "bill_name": "Bill A",
                "council_members": [
                    {"member_name": "John Doe", "action": "sponsored/mover"},
                    {"member_name": "Jane Smith", "action": "voted_for"}
                ]
            }
        ]
    }
    result = merge_vote_pattern_results([single_result])
    assert len(result["bills"]) == 1
    assert result["bills"][0]["bill_name"] == "Bill A"
    assert len(result["bills"][0]["council_members"]) == 2
    print("✓ Single result test passed")
    
    # Test 3: Multiple results with same bill (no conflicts)
    result1 = {
        "bills": [
            {
                "bill_name": "Bill A",
                "council_members": [
                    {"member_name": "John Doe", "action": "sponsored/mover"}
                ]
            }
        ]
    }
    result2 = {
        "bills": [
            {
                "bill_name": "Bill A", 
                "council_members": [
                    {"member_name": "Jane Smith", "action": "voted_for"}
                ]
            }
        ]
    }
    
    merged = merge_vote_pattern_results([result1, result2])
    assert len(merged["bills"]) == 1
    assert merged["bills"][0]["bill_name"] == "Bill A"
    assert len(merged["bills"][0]["council_members"]) == 2
    
    # Check that both members are present
    member_names = [m["member_name"] for m in merged["bills"][0]["council_members"]]
    assert "John Doe" in member_names
    assert "Jane Smith" in member_names
    print("✓ Multiple results merge test passed")
    
    # Test 4: Conflict resolution (higher priority action should win)
    conflict1 = {
        "bills": [
            {
                "bill_name": "Bill B",
                "council_members": [
                    {"member_name": "John Doe", "action": "voted_for"}
                ]
            }
        ]
    }
    conflict2 = {
        "bills": [
            {
                "bill_name": "Bill B",
                "council_members": [
                    {"member_name": "John Doe", "action": "sponsored/mover"}  # Higher priority
                ]
            }
        ]
    }
    
    merged = merge_vote_pattern_results([conflict1, conflict2])
    assert len(merged["bills"]) == 1
    john_doe_action = None
    for member in merged["bills"][0]["council_members"]:
        if member["member_name"] == "John Doe":
            john_doe_action = member["action"]
            break
    
    assert john_doe_action == "sponsored/mover"  # Higher priority should win
    print("✓ Conflict resolution test passed")
    
    # Test 5: Multiple bills across windows
    multi_bill1 = {
        "bills": [
            {
                "bill_name": "Bill X",
                "council_members": [{"member_name": "Alice", "action": "voted_for"}]
            },
            {
                "bill_name": "Bill Y", 
                "council_members": [{"member_name": "Bob", "action": "voted_against"}]
            }
        ]
    }
    multi_bill2 = {
        "bills": [
            {
                "bill_name": "Bill Y",
                "council_members": [{"member_name": "Charlie", "action": "abstained"}]
            },
            {
                "bill_name": "Bill Z",
                "council_members": [{"member_name": "Dave", "action": "co_sponsored/seconder"}]
            }
        ]
    }
    
    merged = merge_vote_pattern_results([multi_bill1, multi_bill2])
    assert len(merged["bills"]) == 3  # Bill X, Bill Y, Bill Z
    
    bill_names = [bill["bill_name"] for bill in merged["bills"]]
    assert "Bill X" in bill_names
    assert "Bill Y" in bill_names 
    assert "Bill Z" in bill_names
    
    # Bill Y should have both Bob and Charlie
    bill_y = None
    for bill in merged["bills"]:
        if bill["bill_name"] == "Bill Y":
            bill_y = bill
            break
    assert bill_y is not None
    assert len(bill_y["council_members"]) == 2
    member_names = [m["member_name"] for m in bill_y["council_members"]]
    assert "Bob" in member_names
    assert "Charlie" in member_names
    
    print("✓ Multiple bills test passed")
    print("All merge tests passed! ✓\n")

def test_window_boundaries():
    """Test edge cases around window boundaries."""
    print("=== Testing window boundary cases ===")
    
    # Test various lengths around the 25k threshold
    test_lengths = [24999, 25000, 25001, 30000, 39999, 40000, 49999, 50000, 50001]
    
    for length in test_lengths:
        text = "X" * length
        windows = create_text_windows(text)
        
        if length <= 25000:
            expected_windows = 1
        else:
            # Calculate expected windows: ceil((length - 20000) / 10000) + 1
            expected_windows = ((length - 20000) + 9999) // 10000 + 1
        
        print(f"Length {length}: {len(windows)} windows (expected {expected_windows})")
        assert len(windows) == expected_windows, f"Failed for length {length}: got {len(windows)}, expected {expected_windows}"
        
        # Verify total coverage
        if len(windows) > 1:
            # First window should be full 20k
            assert len(windows[0]) == 20000
            # Last window should not exceed text length
            last_window_start = (len(windows) - 1) * 10000
            expected_last_window_size = min(20000, length - last_window_start)
            assert len(windows[-1]) == expected_last_window_size
    
    print("✓ All boundary tests passed")

if __name__ == "__main__":
    print("Running sliding window tests...\n")
    
    try:
        test_create_text_windows()
        test_merge_vote_pattern_results()
        test_window_boundaries()
        
        print("🎉 All tests passed successfully!")
        print("\nSummary:")
        print("✓ Window creation logic works correctly")
        print("✓ Result merging handles duplicates and conflicts")
        print("✓ Edge cases around thresholds are handled properly")
        print("✓ Overlap between windows is correct")
        
    except AssertionError as e:
        print(f"❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)