def perform_calculation(num1_str, num2_str, operation):
    try:
        num1 = float(num1_str)
        num2 = float(num2_str)
    except ValueError:
        raise ValueError("Invalid number input")

    if operation == '+':
        return num1 + num2
    elif operation == '-':
        return num1 - num2
    elif operation == '*':
        return num1 * num2
    elif operation == '/':
        if num2 == 0:
            raise ValueError("Division by zero")
        return num1 / num2
    else:
        raise ValueError("Invalid operation")