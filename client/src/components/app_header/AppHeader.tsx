import { Box, Text } from "@chakra-ui/react";
import React, { type FC } from "react";
import { Link, useLocation } from "react-router-dom";

interface NavTab {
  to: string;
  label: string;
  exact?: true;
}

const NAV_TABS: readonly NavTab[] = [
  { to: "/setup", label: "Setup" },
  { to: "/", label: "Profiles", exact: true },
  { to: "/library", label: "Library" },
];

export const AppHeader: FC = () => {
  const { pathname } = useLocation();

  const isActive = (to: string, exact?: boolean): boolean =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  return (
    <Box
      as="header"
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      px={6}
      h="64px"
      bg="gray.900"
      borderBottom="1px solid"
      borderColor="gray.800"
      flexShrink={0}
    >
      <Box display="flex" alignItems="center" gap={3}>
        <Box
          w={9}
          h={9}
          bg="orange.400"
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Text color="gray.900" fontSize="sm" fontWeight="bold">
            ▶
          </Text>
        </Box>
        <Text fontWeight="bold" fontSize="lg" color="orange.400" letterSpacing="tight">
          Media Stream Hub
        </Text>
      </Box>

      <Box as="nav" display="flex" gap={1}>
        {NAV_TABS.map((tab) => {
          const active = isActive(tab.to, tab.exact);
          return (
            <Link key={tab.to} to={tab.to} style={{ textDecoration: "none" }}>
              <Box
                px={4}
                py={2}
                borderRadius="md"
                bg={active ? "orange.400" : "transparent"}
                color={active ? "gray.900" : "gray.400"}
                fontWeight={active ? "semibold" : "medium"}
                fontSize="sm"
                _hover={{
                  color: active ? "gray.900" : "white",
                  bg: active ? "orange.300" : "gray.800",
                }}
                transition="all 0.15s"
              >
                {tab.label}
              </Box>
            </Link>
          );
        })}
      </Box>
    </Box>
  );
};
