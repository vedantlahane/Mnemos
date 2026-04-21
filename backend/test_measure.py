"""Tests for text measurement functionality."""

import pytest
from app.canvas.text_measure import measure_text, _char_width, _line_width


class TestCharWidth:
    """Test character width calculations."""
    
    def test_narrow_characters(self):
        """Test that narrow characters return correct width."""
        # Narrow characters should be 0.5x base
        assert _char_width('i', 10) == 5.0
        assert _char_width('l', 10) == 5.0
        assert _char_width('1', 10) == 5.0
    
    def test_wide_characters(self):
        """Test that wide characters return correct width."""
        # Wide characters should be 1.35x base
        assert _char_width('m', 10) == 13.5
        assert _char_width('W', 10) == 13.5
    
    def test_uppercase_characters(self):
        """Test that uppercase characters return correct width."""
        # Uppercase should be 1.1x base
        assert _char_width('A', 10) == 11.0
        assert _char_width('Z', 10) == 11.0
    
    def test_space_character(self):
        """Test space character width."""
        assert _char_width(' ', 10) == 3.5
    
    def test_tab_character(self):
        """Test tab character width."""
        assert _char_width('\t', 10) == 16.0
    
    def test_default_character(self):
        """Test default character width."""
        assert _char_width('x', 10) == 10.0


class TestLineWidth:
    """Test line width calculations."""
    
    def test_empty_string(self):
        """Test that empty string returns 0 width."""
        assert _line_width('', 10) == 0.0
    
    def test_single_character(self):
        """Test single character line width."""
        assert _line_width('x', 10) == 10.0
    
    def test_mixed_characters(self):
        """Test line with mixed character types."""
        # 'a' (normal) + 'i' (narrow) + 'm' (wide)
        # 10 + 5 + 13.5 = 28.5
        result = _line_width('aim', 10)
        assert abs(result - 28.5) < 0.01


class TestMeasureText:
    """Test the main text measurement function."""
    
    def test_empty_text(self):
        """Test measuring empty text."""
        result = measure_text('')
        assert result['wrapped_text'] == ''
        assert result['width'] == 20
        assert result['line_count'] == 1
    
    def test_whitespace_only(self):
        """Test measuring whitespace-only text."""
        result = measure_text('   ')
        assert result['wrapped_text'] == ''
        assert result['line_count'] == 1
    
    def test_single_line_short_text(self):
        """Test measuring short text that fits in one line."""
        result = measure_text('hello')
        assert result['line_count'] == 1
        assert result['width'] > 0
        assert result['height'] > 0
    
    def test_custom_font_size(self):
        """Test with custom font size."""
        result1 = measure_text('test', font_size=16)
        result2 = measure_text('test', font_size=32)
        # Larger font should have larger dimensions
        assert result2['height'] > result1['height']
    
    def test_multiline_text(self):
        """Test measuring text with multiple lines."""
        result = measure_text('line1\nline2\nline3')
        assert result['line_count'] >= 1
    
    def test_text_wrapping(self):
        """Test that text is wrapped at max_width."""
        long_text = 'a' * 100  # Very long text
        result = measure_text(long_text, max_width=200)
        # Should wrap into multiple lines
        assert result['line_count'] > 1
    
    def test_max_lines_limit(self):
        """Test that text respects max_lines parameter."""
        # Create text that would wrap into many lines
        text = 'short\n' * 300
        result = measure_text(text, max_width=100, max_lines=10)
        assert result['line_count'] <= 10
    
    def test_return_structure(self):
        """Test that return value has expected structure."""
        result = measure_text('test')
        assert 'wrapped_text' in result
        assert 'width' in result
        assert 'height' in result
        assert 'line_count' in result
        assert all(isinstance(result[k], (str, int, float)) for k in result)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
